/**
 * account.js — the account page.
 *
 * Shows the student's identity, the subjects they chose, and a plain-language
 * summary of what is stored against their account.
 */
import { esc } from "../dom.js?v=mwz8hppl";
import { chip, metricCard } from "../components.js?v=mwz8hppl";
import { account, accountEmail, hasPaidAccess } from "../../core/account.js?v=mwz8hppl";
import { config } from "../../core/config.js?v=mwz8hppl";
import { claimPurchase } from "../../core/entitlement.js?v=mwz8hppl";
import { startCheckout } from "../checkout.js?v=mwz8hppl";
import { CORE_SUBJECT_IDS, selectionSubjectIds } from "../../core/subjects.js?v=mwz8hppl";
import { toast } from "../app-toasts.js?v=mwz8hppl";
import { shell } from "../app-state.js?v=mwz8hppl";

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

  const support = `<section class="card stripe" style="--stripe:var(--accent)">
    <h2 style="margin-top:0">Help &amp; support</h2>
    <div class="row wrap gap-2 mt-4">
      <div class="card tight">
        <h3 style="margin:0 0 4px 0">General help</h3>
        <p class="small muted" style="margin:0">Stuck on something? Need help with your account, planner or revision?</p>
        <a class="btn sm" href="mailto:support@padhle.wtf" style="margin-top:6px">Email support@padhle.wtf</a>
      </div>
      <div class="card tight">
        <h3 style="margin:0 0 4px 0">Payments &amp; invoices</h3>
        <p class="small muted" style="margin:0">Questions about your ₹199 payment, invoice or refund?</p>
        <a class="btn sm" href="mailto:billing@padhle.wtf" style="margin-top:6px">Email billing@padhle.wtf</a>
      </div>
      <div class="card tight">
        <h3 style="margin:0 0 4px 0">Feedback &amp; suggestions</h3>
        <p class="small muted" style="margin:0">Have an idea to make PADHLE.WTF better?</p>
        <a class="btn sm" href="mailto:feedback@padhle.wtf" style="margin-top:6px">Email feedback@padhle.wtf</a>
      </div>
      <div class="card tight">
        <h3 style="margin:0 0 4px 0">Founder directly</h3>
        <p class="small muted" style="margin:0">Want to reach the founder personally?</p>
        <a class="btn sm" href="mailto:founder@padhle.wtf" style="margin-top:6px">Email founder@padhle.wtf</a>
      </div>
    </div>
  </section>`;

  const panels = [header, profile, subjects, privacy, support];
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
        <p class="small muted" style="margin-top:6px">Invoice or payment questions? Email <b>billing@padhle.wtf</b>.</p>
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
    <p class="small muted mt-2">Payment or invoice questions? Email <b>billing@padhle.wtf</b>.</p>
  </section>`;
}

async function handlePay(ctx) {
  if (!config.razorpayKeyId) {
    toast("Payments are not configured on this deployment.", "err");
    return;
  }

  const btn = shell.viewEl?.querySelector('[data-plan-pay]');
  const prevLabel = btn ? btn.textContent : "";
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Opening checkout…"; }
    await startCheckout({
      receipt: "padhle-account",
      onPaid: () => {
        ctx.rerender();
        toast(`Full access activated until ${planExpiryLabel(account.profile?.planExpiresAt || "10 March 2027")}. ✓`, "ok");
      },
    });
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
