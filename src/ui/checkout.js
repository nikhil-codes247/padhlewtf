/**
 * checkout.js — the single Razorpay checkout flow used by every paywall screen.
 *
 * The server creates the order (the amount is fixed there), the browser only
 * opens Checkout, and `/api/verify-payment` decides whether access is granted.
 * Callers pass `onPaid` for whatever should happen after the grant succeeds
 * (rerender a panel, close the onboarding tour, navigate).
 *
 * Every failure is surfaced. A Razorpay success screen is not a grant: the
 * handler waits for `activatePaidAccess` to confirm the plan really changed.
 */
import { config } from "../core/config.js?v=mwz8yitl";
import { account, accountEmail, signOutAccount } from "../core/account.js?v=mwz8yitl";
import { activatePaidAccess, PaymentAuthError } from "../core/entitlement.js?v=mwz8yitl";
import { toast } from "./app-toasts.js?v=mwz8yitl";

let loading = null;

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment provider."));
    document.head.appendChild(script);
  });
  return loading;
}

async function requireSignIn(err) {
  if (!(err instanceof PaymentAuthError)) return false;
  toast(err.message, "warn");
  // The payment is stored locally before verification, so signing in again
  // finishes the activation instead of asking for another payment.
  try { await signOutAccount(); } catch { /* local state is cleared regardless */ }
  location.hash = "#/login";
  return true;
}

/**
 * Open Razorpay Checkout for the ₹199 full-access purchase.
 * Resolves `true` once Checkout is open; the payment itself finishes in the
 * handler and reports through `onPaid` or a toast.
 */
export async function startCheckout({ receipt = "padhle", onPaid } = {}) {
  const keyId = config.razorpayKeyId;
  if (!keyId) {
    toast("Payments are not configured on this deployment.", "err");
    return false;
  }

  const res = await fetch("/api/create-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount: 19900, currency: "INR", receipt: `${receipt}_${Date.now()}` }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || "Could not create the payment order.");
  if (!payload?.order_id) throw new Error("The payment order came back empty.");

  await loadRazorpay();
  if (!window.Razorpay) throw new Error("The payment provider did not load.");

  const rzp = new window.Razorpay({
    key: keyId,
    amount: payload.amount,
    currency: payload.currency,
    order_id: payload.order_id,
    name: "PADHLE.WTF",
    description: "Full access until 10 March 2027 — one-time payment ₹199",
    theme: { color: "#a8c8bb" },
    prefill: {
      email: accountEmail() || undefined,
      name: account.profile?.displayName || undefined,
    },
    handler: async (response) => {
      try {
        await activatePaidAccess({
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
        });
        toast("Full access unlocked until 10 March 2027 ✓", "ok");
        await onPaid?.();
      } catch (err) {
        if (await requireSignIn(err)) return;
        toast(err?.message || "Payment could not be verified. Contact support if money was debited.", "err");
      }
    },
    modal: {
      ondismiss: () => toast("Payment wasn't completed. Try again, or contact support if money was debited.", "warn"),
    },
  });
  rzp.open();
  return true;
}
