/**
 * account.js — the account page.
 *
 * Shows the student's identity, the subjects they chose, and a plain-language
 * summary of what is stored against their account.
 */
import { esc } from "../dom.js";
import { chip, metricCard } from "../components.js";
import { account, accountEmail, hasPaidAccess, initAccount } from "../../core/account.js";
import { config } from "../../core/config.js";
import { activatePaidAccess, claimPurchase } from "../../core/entitlement.js";
import { CORE_SUBJECT_IDS, selectionSubjectIds } from "../../core/subjects.js";
import { toast } from "../app-toasts.js";
import { shell } from "../app-state.js";

function supabasePanel(ctx) {
  const store = ctx.store;
  const p = account.profile;
  const chosen = selectionSubjectIds(account.selection) || [...CORE_SUBJECT_IDS];
  const email = accountEmail();
  const subjectChip = (id) => {
    const s = store.subject(id) || account.catalog.find((c) => c.id === id);
    if (!s) return "";
    return `<a class="chip soft" href="#/subject/${esc(id)}"><span class="dot" style="background:${esc(s.color || "var(--accent)")}"></span> ${esc(s.short || s.name)}</a>`;
  };

  const header = `<section class="card stripe" style="--stripe:var(--accent)">
    <div class="row wrap between gap-4" style="align-items:center">
      <div class="grow" style="min-width:260px">
        <span class="eyebrow">Account</span>
        <h1 style="margin:6px 0">Your account</h1>
        <p class="small muted" style="margin:0">Your username, avatar, subject choices and every study record are saved to your account — planner tasks, ticks, sessions, revisions and notes included.</p>
      </div>
      <div class="row gap-2">${chip("signed in", "ok")}<button class="btn sm" type="button" data-act="auth-signout">Sign out</button></div>
    </div>
    <div class="metrics mt-4">
      ${metricCard({ k: "Username", v: esc(p ? `@${p.username}` : "—"), s: "unique to you" })}
      ${metricCard({ k: "Subjects", v: `${chosen.length}`, s: "chosen subjects" })}
      ${metricCard({ k: "Email", v: `<span class="small">${esc(email || "—")}</span>`, s: "used only to sign in" })}
    </div>
  </section>`;

  const profile = `<section class="card">
    <div class="row wrap between gap-4" style="align-items:flex-start">
      <div class="row gap-3" style="align-items:center">
        <span class="account-avatar" aria-hidden="true">${esc(p?.avatar || "🦉")}</span>
        <div>
          <h2 style="margin:0">${esc(p?.displayName || "Student")}</h2>
          <div class="small muted">@${esc(p?.username || "")}</div>
        </div>
      </div>
      <a class="btn" href="#/set-username">Edit profile</a>
    </div>
    <p class="small muted mt-4" style="margin-bottom:0">Your username is how you appear on shared progress cards. It cannot be duplicated — the account system guarantees it.</p>
  </section>`;

  const subjects = `<section class="card">
    <div class="row wrap between gap-3">
      <div>
        <h2 style="margin:0">Your subjects</h2>
        <p class="small muted" style="margin:4px 0 0">Only these appear on your dashboard.</p>
      </div>
      <a class="btn" href="#/choose-subjects">Change subjects</a>
    </div>
    <div class="setup-subject-head mt-4">
      <div>
        <b>Chosen subjects</b>
        <p class="small muted">Any combination of the eleven — change it any time.</p>
      </div>
      <span class="setup-count-pill"><b>${chosen.length}</b> / 11 selected</span>
    </div>
    <div class="row wrap gap-2 mt-2">${chosen.map((id) => subjectChip(id)).join("")}</div>
  </section>`;

  const privacy = `<section class="card">
    <h2 style="margin-top:0">Your data is yours</h2>
    <p class="small muted" style="margin:4px 0 0">Everything you create is stored against your account and protected so no one else can read or change it. It survives a refresh, signing out, another device and clearing this browser's site data — sign back in and it is all still there.</p>
    <ul class="small muted" style="margin:12px 0 0;padding-left:18px">
      <li>Email (for signing in), unique username, display name and avatar</li>
      <li>Your subject selection and preferences</li>
      <li>Planner tasks, completion ticks, deadlines and tags</li>
      <li>Timer sessions, revision history, notes and doubts</li>
      <li>XP, levels, streaks and the points ledger</li>
    </ul>
  </section>`;

  const panels = [header, profile, subjects, privacy];
  // Pricing / buy UI appears only after onboarding is complete — never during
  // the welcome tour, so the student isn't interrupted before they're set up.
  if (ctx.store?.state?.settings?.onboarded) {
    panels.splice(3, 0, planPanel(ctx));
  }
  return panels.join("");
}

function planExpiryLabel(expiresAt) {
  if (!expiresAt) return "";
  try {
    return new Date(expiresAt).toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return String(expiresAt);
  }
}

/**
 * One-time purchase panel: ₹199 for full access until 10 March 2027.
 * Shown on the Account page so the student can buy and see their status in one place.
 */
function planPanel(ctx) {
  const p = account.profile || {};
  const active = p.plan === "full_access" && p.planExpiresAt && new Date(p.planExpiresAt) > new Date();

  if (active) {
    return `<section class="card stripe" style="--stripe:var(--accent)">
      <div class="row wrap between gap-4" style="align-items:center">
        <div class="grow" style="min-width:260px">
          <span class="eyebrow">Plan &amp; access</span>
          <h1 style="margin:6px 0">Full access</h1>
          <p class="small muted" style="margin:0">You have paid access to PADHLE.WTF until ${esc(planExpiryLabel(p.planExpiresAt))}. Your plan is tied to your account — sign in on any device and it is still there.</p>
        </div>
        <div>${chip("active until " + esc(planExpiryLabel(p.planExpiresAt)), "ok")}</div>
      </div>
    </section>`;
  }

  const buyButton = !config.razorpayKeyId
    ? `<button class="btn" type="button" disabled>Payments not configured</button>`
    : `<button class="btn primary" type="button" data-plan-pay>Buy full access — ₹199</button>`;

  return `<section class="card">
    <div class="row wrap between gap-4" style="align-items:flex-start">
      <div class="grow" style="min-width:260px">
        <span class="eyebrow">Plan &amp; access</span>
        <h1 style="margin:6px 0">Buy full access</h1>
        <p class="small muted" style="margin:0">One-time payment of ₹199 unlocks everything in PADHLE.WTF until 10 March 2027. No subscription, no recurring charge — pay once and study through your boards.</p>
      </div>
      <div class="row wrap gap-2" style="justify-content:flex-end">
        ${buyButton}
        <button class="btn ghost sm" type="button" data-plan-restore>Already paid? Restore access</button>
      </div>
    </div>
    <p class="small muted mt-4" style="margin:0">Powered by Razorpay. Your card details are handled by Razorpay; PADHLE.WTF never sees them.</p>
  </section>`;
}

let razorpayLoading = null;

function loadRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (razorpayLoading) return razorpayLoading;
  razorpayLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment provider."));
    document.head.appendChild(script);
  });
  return razorpayLoading;
}

async function handlePay(ctx) {
  if (!config.razorpayKeyId) {
    toast("Payments are not configured on this deployment.", "err");
    return;
  }

  const btn = shell.viewEl?.querySelector('[data-plan-pay]');
  const prevLabel = btn ? btn.textContent : "";
  let handled = false;

  try {
    if (btn) { btn.disabled = true; btn.textContent = "Creating order…"; }

    // STEP 1: ask the backend to create a Razorpay order (server fixes the amount).
    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 19900, currency: "INR", receipt: `padhle_${Date.now()}` }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "Could not create the payment order.");
    if (!payload?.order_id) throw new Error("The payment order came back empty.");

    // Load the Razorpay checkout script, then open the modal.
    await loadRazorpay();
    if (!window.Razorpay) throw new Error("The payment provider did not load.");

    const options = {
      key: config.razorpayKeyId,
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
        handled = true;
        // STEP 2: server checks the signature and grants access.
        await activatePaidAccess({
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
        });

        // Refresh the profile so the plan panel flips to "Full access".
        try { await initAccount({ force: true }); } catch { /* best effort */ }
        if (!hasPaidAccess()) {
          toast("Payment went through, but access did not stick. Contact support with your payment id.", "warn");
          return;
        }
        ctx.rerender();
        toast(`Full access activated until ${planExpiryLabel(account.profile?.planExpiresAt || "10 March 2027")}. ✓`, "ok");
      },
      modal: {
        ondismiss: () => {
          if (!handled) {
            toast("Payment wasn't completed. Try again, or contact support if money was debited.", "warn");
          }
        },
      },
    };

    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (err) {
    toast(err?.message || "Could not start the payment. Try again.", "err");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prevLabel; }
  }
}

export default {
  id: "account",
  title: "Account",
  render(ctx) {
    return supabasePanel(ctx);
  },

  mount(ctx) {
    const btn = shell.viewEl?.querySelector('[data-plan-pay]');
    if (btn && !btn.dataset.planPayWired) {
      btn.dataset.planPayWired = "1";
      btn.addEventListener("click", () => handlePay(ctx));
    }

    const restore = shell.viewEl?.querySelector('[data-plan-restore]');
    if (restore && !restore.dataset.restoreWired) {
      restore.dataset.restoreWired = "1";
      restore.addEventListener("click", async () => {
        const prev = restore.textContent;
        restore.disabled = true;
        restore.textContent = "Checking Razorpay…";
        try {
          await claimPurchase();
          try { await initAccount({ force: true }); } catch { /* best effort */ }
          ctx.rerender();
          toast("Full access restored until 10 March 2027 ✓", "ok");
        } catch (err) {
          toast(err?.message || "Could not restore your purchase.", "err");
        } finally {
          restore.disabled = false;
          restore.textContent = prev;
        }
      });
    }
    return null;
  },
};
