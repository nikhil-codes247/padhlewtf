/**
 * Cloudflare Pages Function: POST /api/verify-payment
 *
 * Verifies a Razorpay payment signature and, when valid, activates full access
 * for the signed-in caller until 10 March 2027.
 *
 * Runs on Cloudflare's edge — RAZORPAY_KEY_SECRET never reaches the browser.
 *
 * Environment variables (set in Cloudflare dashboard):
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 *   PADHLE_SUPABASE_URL
 *   PADHLE_SUPABASE_ANON_KEY
 *   PADHLE_SUPABASE_SERVICE_KEY   (optional; makes the grant independent of RLS)
 */
import { grantPaidAccess, PLAN, EXPIRES_AT } from "../_lib/grant.js";

/** Razorpay signature algorithm: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
async function validSignature(orderId, paymentId, signature, keySecret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keySecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${orderId}|${paymentId}`));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === signature;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    return Response.json(
      { error: "Payments are not configured on this deployment." },
      { status: 500, headers: { "Content-Type": "application/json", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY" } },
    );
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request body must be valid JSON." },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = body;
  if (!paymentId || !orderId || !signature) {
    return Response.json(
      { error: "razorpay_payment_id, razorpay_order_id and razorpay_signature are all required." },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Verify the Razorpay signature server-side.
  if (!(await validSignature(orderId, paymentId, signature, keySecret))) {
    return Response.json(
      { error: "Payment signature did not match. This payment was not authorised." },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Signature is valid. Grant entitlement to the signed-in caller.
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const claims = token ? jwtClaims(token) : null;
  const grant = await grantPaidAccess({
    env,
    token,
    uid: claims?.sub || null,
    email: claims?.email || null,
  });

  return Response.json(
    {
      ok: true,
      verified: true,
      paid: Boolean(grant.paid),
      plan: grant.paid ? PLAN : null,
      expiresAt: grant.paid ? EXPIRES_AT : null,
      paymentId,
      ...(grant.authRequired ? { authRequired: true } : {}),
      ...(grant.error ? { error: grant.error } : {}),
    },
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "X-Content-Type-Options": "nosniff",
        "X-Frame-Options": "DENY",
        "Referrer-Policy": "strict-origin-when-cross-origin",
      },
    },
  );
}

/** Read `sub` + `email` from a JWT payload. PostgREST verifies the signature for us. */
function jwtClaims(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return {
      sub: typeof json.sub === "string" && json.sub ? json.sub : null,
      email: typeof json.email === "string" ? json.email : null,
    };
  } catch {
    return null;
  }
}
