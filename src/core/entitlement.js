/**
 * entitlement.js — turn a completed Razorpay checkout into paid access.
 *
 * The signature check must happen on the server, so this module only orchestrates
 * the two browser-side steps:
 *   1. ask /api/verify-payment to check the signature and grant access;
 *   2. fail loudly when the server verified the payment but could not save it.
 *
 * The old code stopped at `ok`, which the server returns even when the grant
 * failed — so the UI said "unlocked" while the profile stayed on `free`. Never
 * treat a payment as done unless the server says `paid: true`.
 */
import { accessToken } from "./account.js";

export async function activatePaidAccess({ paymentId, orderId, signature }) {
  const token = await accessToken();
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch("/api/verify-payment", {
    method: "POST",
    headers,
    body: JSON.stringify({
      razorpay_payment_id: paymentId,
      razorpay_order_id: orderId,
      razorpay_signature: signature,
    }),
  });
  const body = await res.json().catch(() => ({}));

  if (!res.ok || !body.ok) {
    throw new Error(
      body?.error ||
        "Payment could not be verified. If money was debited, contact support — it will be refunded.",
    );
  }
  if (!body.paid) {
    throw new Error(
      body.error ||
        "Payment was verified, but access could not be saved. Sign in again and retry, or contact support.",
    );
  }
  return body;
}

/**
 * Recover a purchase that was captured but never activated. The server asks
 * Razorpay for a captured ₹199 payment on the signed-in email, so no payment id
 * is needed from the student.
 */
export async function claimPurchase() {
  const token = await accessToken();
  if (!token) throw new Error("Sign in first, then restore your purchase.");

  const res = await fetch("/api/claim-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.paid) {
    throw new Error(body?.error || "Could not restore your purchase. Contact support with your payment id.");
  }
  return body;
}
