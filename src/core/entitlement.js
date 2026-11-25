/**
 * entitlement.js — turn a completed Razorpay checkout into paid access.
 *
 * The signature check must happen on the server, so this module only orchestrates
 * the browser-side steps:
 *   1. ask /api/verify-payment to check the signature and grant access;
 *   2. fail loudly when the server verified the payment but could not save it;
 *   3. remember the payment so an expired session can never lose it.
 *
 * The old code stopped at `ok`, which the server returns even when the grant
 * failed — so the UI said "unlocked" while the profile stayed on `free`. Never
 * treat a payment as done unless the server says `paid: true` and the refreshed
 * profile actually reports access.
 */
import { account, accessToken, initAccount, hasPaidAccess, isSignedIn } from "./account.js";
import { cacheInvalidate } from "./requestCache.js";

const PENDING_KEY = "padhle.pending.payment.v1";
const AUTO_CLAIM_KEY = "padhle.claim.auto.v1";

/** The session was missing or rejected, so the student must sign in again. */
export class PaymentAuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "PaymentAuthError";
    this.status = 401;
  }
}

function storage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

/** Keep the verified-payment details until the grant actually sticks. */
export function rememberPendingPayment(payment) {
  try { storage()?.setItem(PENDING_KEY, JSON.stringify(payment)); } catch { /* private mode */ }
}

export function pendingPayment() {
  try {
    const raw = storage()?.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.paymentId && parsed?.orderId && parsed?.signature ? parsed : null;
  } catch {
    return null;
  }
}

export function forgetPendingPayment() {
  try { storage()?.removeItem(PENDING_KEY); } catch { /* private mode */ }
}

async function verifyPayment({ paymentId, orderId, signature }) {
  const token = await accessToken();
  if (!token) {
    throw new PaymentAuthError(
      "Your sign-in expired before the payment finished. Sign in again — your payment is saved and will activate automatically.",
    );
  }

  const res = await fetch("/api/verify-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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
    if (body.authRequired) {
      throw new PaymentAuthError(
        body.error ||
          "Your sign-in expired before the payment finished. Sign in again — your payment is saved and will activate automatically.",
      );
    }
    throw new Error(
      body.error ||
        "Payment was verified, but access could not be saved. Sign in again and retry, or contact support.",
    );
  }
  return body;
}

/** Re-read the profile with the read cache cleared, then report real access. */
async function reloadEntitlement() {
  // The server wrote the row directly, so the browser's short-lived profile
  // cache still holds the old `free` copy. Bust it before re-reading.
  cacheInvalidate("GET /rest/v1/profiles");
  try { await initAccount({ force: true }); } catch { /* keep the old state */ }
  return hasPaidAccess();
}

/**
 * Verify a checkout response and grant access. Throws unless the refreshed
 * profile really reports full access.
 */
export async function activatePaidAccess({ paymentId, orderId, signature }) {
  const payment = { paymentId, orderId, signature };
  rememberPendingPayment(payment);
  await verifyPayment(payment);

  let paid = await reloadEntitlement();
  if (!paid) {
    // The write and the read can race at the edge; give the row one moment.
    await new Promise((resolve) => setTimeout(resolve, 900));
    paid = await reloadEntitlement();
  }
  if (!paid) {
    throw new Error(
      "Payment was verified, but your plan did not refresh. Sign in again and press Restore access — your payment is saved.",
    );
  }

  forgetPendingPayment();
  return true;
}

/**
 * Retry a payment that was verified but could not be saved because the session
 * had expired. Called after sign-in; safe to call when there is nothing pending.
 */
export async function retryPendingPayment() {
  const payment = pendingPayment();
  if (!payment || !isSignedIn()) return false;
  try {
    await activatePaidAccess(payment);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recover a purchase that was captured but never activated. The server asks
 * Razorpay for a captured ₹199 payment on the signed-in email, so no payment id
 * is needed from the student.
 */
export async function claimPurchase() {
  const token = await accessToken();
  if (!token) throw new PaymentAuthError("Sign in first, then restore your purchase.");

  const res = await fetch("/api/claim-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: "{}",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.paid) {
    const err = new Error(body?.error || "Could not restore your purchase. Contact support with your payment id.");
    err.status = res.status;
    if (res.status === 401 || body?.authRequired) throw new PaymentAuthError(err.message);
    throw err;
  }

  const paid = await reloadEntitlement();
  if (!paid) {
    throw new Error("Access was granted, but your profile did not refresh. Reload the page to see it.");
  }
  forgetPendingPayment();
  return body;
}

let recovering = false;

/**
 * The single recovery entry point used after boot and after sign-in. Guarded so
 * the account re-read inside a successful grant cannot trigger another attempt.
 */
export async function recoverPurchase() {
  if (recovering || !isSignedIn() || hasPaidAccess()) return false;
  recovering = true;
  try {
    if (await retryPendingPayment()) return true;
    return await autoClaimOnce();
  } finally {
    recovering = false;
  }
}

/**
 * One automatic recovery attempt per account. A student whose payment was
 * captured before this fix should not have to hunt for a button; the first
 * boot after signing in checks Razorpay once and restores access if a matching
 * captured payment exists. A normal free student gets a quiet 404 and is not
 * checked again on this browser.
 */
export async function autoClaimOnce() {
  if (!isSignedIn() || hasPaidAccess()) return false;
  const uid = account.profile?.id || account.session?.user?.id || "anon";
  const key = `${AUTO_CLAIM_KEY}.${uid}`;
  const store = storage();
  try {
    if (store?.getItem(key)) return false;
    store?.setItem(key, "1");
  } catch { /* private mode */ }

  try {
    await claimPurchase();
    return true;
  } catch (err) {
    // 404 means "this email has no captured payment" — remember that and stay quiet.
    if (err?.status !== 404) {
      try { store?.removeItem(key); } catch { /* private mode */ }
    }
    return false;
  }
}
