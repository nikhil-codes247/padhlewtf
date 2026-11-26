/**
 * Cloudflare Pages Function: POST /api/create-order
 *
 * Creates a Razorpay order for the one-time ₹199 purchase.
 * Runs on Cloudflare's edge — RAZORPAY_KEY_SECRET never reaches the browser.
 *
 * Environment variables (set in Cloudflare dashboard):
 *   RAZORPAY_KEY_ID
 *   RAZORPAY_KEY_SECRET
 */

// One-time product: ₹199.00 → 19900 paise. Server-fixed; client cannot change it.
const AMOUNT_PAISE = 19900;
const CURRENCY = "INR";
const RECEIPT_PREFIX = "padhle-full-access";

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
  } catch { /* keep body = {} */ }

  // The server fixes the amount to ₹199. Reject anything below Razorpay minimum (100 paise).
  const requested = Number(body.amount);
  const amount = Number.isFinite(requested) && requested >= 100 ? requested : AMOUNT_PAISE;
  if (amount < 100) {
    return Response.json(
      { error: "Amount must be at least ₹1.00 (100 paise)." },
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // Create Razorpay order server-side
  const razorpayRes = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(keyId + ":" + keySecret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: AMOUNT_PAISE, // server-fixed: ₹199
      currency: CURRENCY,
      receipt: `${RECEIPT_PREFIX}_${Date.now()}`,
      notes: { purpose: "full_access_until_2027-03-10" },
    }),
  });

  if (!razorpayRes.ok) {
    const errText = await razorpayRes.text().catch(() => "");
    return Response.json(
      { error: "Could not create the payment order. Try again." },
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const order = await razorpayRes.json();

  const headers = {
    "Content-Type": "application/json",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
  };

  return Response.json({
    order_id: order.id,
    amount: order.amount,
    currency: order.currency,
  }, { status: 200, headers });
}
