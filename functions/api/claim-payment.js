/**
 * Cloudflare Pages Function: POST /api/claim-payment
 *
 * Recovers access for a payment that was captured but never activated — the
 * "I paid, it said success, but my account is still free" case.
 *
 * Safety comes from Razorpay, not from the browser: we ask Razorpay for the
 * payment (or for the signed-in email's payments) and only grant when a captured
 * ₹199 INR payment exists for the same email address as the signed-in account.
 *
 * Body (optional): { razorpay_payment_id }
 * When omitted, the newest captured ₹199 payment for the signed-in email is used.
 *
 * Environment variables:
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *   PADHLE_SUPABASE_URL
 *   PADHLE_SUPABASE_ANON_KEY
 *   PADHLE_SUPABASE_SERVICE_KEY   (optional)
 */
import { grantPaidAccess, PLAN, EXPIRES_AT } from "../_lib/grant.js";

const AMOUNT_PAISE = 19900;
const CURRENCY = "INR";

const json = (body, status = 200) =>
  Response.json(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
    },
  });

function jwtSubject(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof parsed.sub === "string" && parsed.sub ? parsed.sub : null;
  } catch {
    return null;
  }
}

const sameEmail = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();

export async function onRequestPost({ request, env }) {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  const supabaseUrl = env.PADHLE_SUPABASE_URL;
  const supabaseAnonKey = env.PADHLE_SUPABASE_ANON_KEY;

  if (!keyId || !keySecret) return json({ error: "Payments are not configured on this deployment." }, 500);
  if (!supabaseUrl || !supabaseAnonKey) return json({ error: "The deployment is not connected to Supabase." }, 500);

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const uidFromToken = token ? jwtSubject(token) : null;
  if (!token || !uidFromToken) return json({ error: "Sign in first, then restore your purchase." }, 401);

  const base = supabaseUrl.replace(/\/$/, "");
  const basic = "Basic " + btoa(`${keyId}:${keySecret}`);

  // 1. Who is signed in? Ask Supabase, which also validates the token.
  const userRes = await fetch(`${base}/auth/v1/user`, {
    headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
  });
  // Supabase Auth answers 401 for an expired token and 403 (`bad_jwt`) for an
  // unreadable one. Both mean "sign in again", not "the server is broken".
  if (userRes.status === 401 || userRes.status === 403) {
    return json({ error: "Your sign-in expired. Sign in again, then restore your purchase.", authRequired: true }, 401);
  }
  if (!userRes.ok) return json({ error: "Could not read your account. Try again." }, 502);
  const user = await userRes.json().catch(() => ({}));
  const email = user?.email;
  const uid = user?.id || uidFromToken;
  if (!email) return json({ error: "Your account has no email address to match a payment against." }, 400);

  let body = {};
  try { body = await request.json(); } catch { /* optional body */ }

  // 2. Find a captured ₹199 payment for this email.
  let payment = null;
  if (body?.razorpay_payment_id) {
    const payRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(body.razorpay_payment_id)}`, {
      headers: { Authorization: basic },
    });
    if (!payRes.ok) return json({ error: "That payment id was not found in Razorpay." }, 404);
    payment = await payRes.json();
    if (!sameEmail(payment?.email, email)) {
      return json({ error: "That payment was made with a different email. Sign in with the email you paid with." }, 403);
    }
  } else {
    // Razorpay has no "filter by email" parameter, so scan recent payments and
    // match the signed-in email ourselves.
    const matches = (p) =>
      sameEmail(p?.email, email) &&
      p?.status === "captured" &&
      p?.amount === AMOUNT_PAISE &&
      p?.currency === CURRENCY;
    for (let skip = 0; skip < 300 && !payment; skip += 100) {
      const listRes = await fetch(`https://api.razorpay.com/v1/payments?count=100&skip=${skip}`, {
        headers: { Authorization: basic },
      });
      if (!listRes.ok) return json({ error: "Could not look up payments. Try again." }, 502);
      const list = await listRes.json().catch(() => ({}));
      const items = list?.items || [];
      payment = items.find(matches) || null;
      if (items.length < 100) break;
    }
    if (!payment) return json({ error: "No captured ₹199 payment was found for this email." }, 404);
  }

  if (payment.amount !== AMOUNT_PAISE || payment.currency !== CURRENCY) {
    return json({ error: "That payment is not the ₹199 full-access purchase." }, 400);
  }
  if (payment.status !== "captured" && payment.status !== "authorized") {
    return json({ error: `That payment is "${payment.status}", not captured. Nothing to activate yet.` }, 400);
  }

  // 3. Grant access. This also creates a missing profile row.
  const grant = await grantPaidAccess({ env, token, uid, email });
  if (!grant.paid) {
    const status = grant.status === 401 ? 401 : grant.status === 409 ? 409 : 502;
    return json(
      { error: grant.error || "Could not activate access on your account.", ...(grant.authRequired ? { authRequired: true } : {}) },
      status,
    );
  }

  return json({
    ok: true,
    paid: true,
    plan: PLAN,
    expiresAt: EXPIRES_AT,
    paymentId: payment.id,
  });
}
