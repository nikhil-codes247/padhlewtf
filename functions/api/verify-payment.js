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
  const authHeader = request.headers.get("authorization");
  let paid = false;
  let grantError = null;

  if (authHeader) {
    const supabaseUrl = env.PADHLE_SUPABASE_URL;
    const supabaseAnonKey = env.PADHLE_SUPABASE_ANON_KEY;
    if (supabaseUrl && supabaseAnonKey) {
      try {
        const baseUrl = supabaseUrl.replace(/\/$/, "");
        const patchRes = await fetch(`${baseUrl}/rest/v1/profiles`, {
          method: "PATCH",
          headers: {
            Authorization: authHeader,
            apikey: supabaseAnonKey,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            plan: PLAN,
            plan_expires_at: EXPIRES_AT,
            updated_at: new Date().toISOString(),
          }),
        });
        if (!patchRes.ok) {
          grantError = `Could not activate access on your account (HTTP ${patchRes.status}).`;
        } else {
          paid = true;
        }
      } catch (err) {
        grantError = err?.message || "Could not activate access on your account.";
      }
    } else {
      grantError = "The deployment is not connected to Supabase, so access could not be activated automatically.";
    }
  } else {
    grantError = "Sign in to activate full access on your account.";
  }

  return Response.json({
    ok: true,
    paid,
    plan: paid ? PLAN : null,
    expiresAt: paid ? EXPIRES_AT : null,
    ...(grantError ? { error: grantError } : {}),
  }, { status: 200, headers: { "Content-Type": "application/json" } });
}
