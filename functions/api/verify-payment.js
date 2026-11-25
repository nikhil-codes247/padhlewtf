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
 */

const PLAN = "full_access";
// Full access until end of day, 10 March 2027 (Indian Standard Time, UTC+5:30).
const EXPIRES_AT = "2027-03-10T23:59:59+05:30";

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
      { status: 500, headers: { "Content-Type": "application/json" } },
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

  // STEP 3: verify the Razorpay signature server-side.
  if (!(await validSignature(orderId, paymentId, signature, keySecret))) {
    // Signature mismatch: do NOT mark the account as paid.
    return Response.json(
      { error: "Payment signature did not match. This payment was not authorised." },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Signature is valid. Grant entitlement to the signed-in caller, if they
  // supplied their Supabase access token.
  const authHeader = request.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  let paid = false;
  let grantError = null;

  if (!token) {
    grantError = "You were signed out when the payment finished. Sign in and press Retry activation.";
  } else {
    const uid = jwtSubject(token);
    if (!uid) {
      grantError = "That sign-in token is not readable. Sign in again and press Retry activation.";
    } else {
      const supabaseUrl = env.PADHLE_SUPABASE_URL;
      const supabaseAnonKey = env.PADHLE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !supabaseAnonKey) {
        grantError = "The deployment is not connected to Supabase, so access could not be activated automatically.";
      } else {
        try {
          const baseUrl = supabaseUrl.replace(/\/$/, "");
          const patchRes = await fetch(
            `${baseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(uid)}`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${token}`,
                apikey: supabaseAnonKey,
                "Content-Type": "application/json",
                Prefer: "return=representation",
              },
              body: JSON.stringify({
                plan: PLAN,
                plan_expires_at: EXPIRES_AT,
              }),
            },
          );

          if (patchRes.status === 401) {
            grantError = "Your sign-in expired before the payment was confirmed. Sign in again and press Retry activation.";
          } else if (patchRes.status === 403) {
            grantError = "Supabase refused to update your profile (row-level security). Check the profiles_update_own policy.";
          } else if (!patchRes.ok) {
            const detail = await patchRes.text().catch(() => "");
            grantError = `Could not activate access on your account (HTTP ${patchRes.status})${detail ? `: ${detail.slice(0, 160)}` : ""}.`;
          } else {
            // PostgREST answers 200 with an empty array when RLS matched no row.
            const rows = await patchRes.json().catch(() => null);
            if (Array.isArray(rows) && rows.length === 0) {
              grantError = "No profile row was found for this account, so access could not be saved.";
            } else {
              paid = true;
            }
          }
        } catch (err) {
          grantError = err?.message || "Could not activate access on your account.";
        }
      }
    }
  }

  return Response.json({
    ok: true,
    verified: true,
    paid,
    plan: paid ? PLAN : null,
    expiresAt: paid ? EXPIRES_AT : null,
    ...(grantError ? { error: grantError } : {}),
  }, { status: 200, headers: { "Content-Type": "application/json" } });
}

/** Read `sub` (the Supabase user id) from a JWT payload. PostgREST verifies the signature for us. */
function jwtSubject(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof json.sub === "string" && json.sub ? json.sub : null;
  } catch {
    return null;
  }
}
