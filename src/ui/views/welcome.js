/**
 * welcome.js — the public landing page.
 *
 * Signed-out visitors see the marketing landing. Signed-in FREE students see
 * a preview of every feature (read-only, can't interact) plus the buy panel
 * at the bottom. Signed-in PAID students are redirected to the dashboard by
 * the router and never land here.
 */
import { esc, fmtNum } from "../dom.js";
import { chip } from "../components.js";
import { brand, TAGLINE } from "../../core/branding.js";
import {
  isSignedIn, account, accountEmail, hasPaidAccess, initAccount,
} from "../../core/account.js";
import { config } from "../../core/config.js";
import { activatePaidAccess, claimPurchase } from "../../core/entitlement.js";
import { ALL_SUBJECT_IDS } from "../../core/subjects.js";
import { subjectMeta, syllabusTotals, loadPublicCatalogue } from "../../core/subjectCatalog.js";
import { mascot } from "../mascot.js";
import { toast } from "../app-toasts.js";
import { shell } from "../app-state.js";
import { openModal } from "../app-modals.js";

const FEATURES = [
  { ico: "▤", title: "Whole syllabus, mapped", text: "Every CBSE subject, unit and chapter in one checklist." },
  { ico: "◷", title: "Timed study sessions", text: "A timer that saves real minutes against the chapter you're on." },
  { ico: "↻", title: "Spaced revision ladder", text: "+1 / +3 / +7 / +21 / +45 day revision passes." },
  { ico: "▦", title: "60-day study plan", text: "A ready-made daily plan — move tasks, balance days, stay on track." },
  { ico: "✦", title: "XP, streaks, badges", text: "Turn a long syllabus into visible momentum." },
  { ico: "✎", title: "Doubts & notes", text: "Capture questions and notes per chapter, synced to your account." },
  { ico: "🃏", title: "Flashcards", text: "Flip through spaced-repetition flashcards per chapter." },
  { ico: "❓", title: "Practice questions", text: "Chapter-wise practice questions with scoring and mastery." },
];

const STEPS = [
  { n: "01", title: "Pick your subjects", text: "Choose any of the eleven CBSE subjects." },
  { n: "02", title: "Follow a real plan", text: "Load the 60-day plan on day one." },
  { n: "03", title: "Revise what matters", text: "Sessions and past-paper frequency feed your dashboard." },
];

function subjectName(store, id) {
  const s = store.subject?.(id) || subjectMeta(id);
  const fallback = { name: id, short: id, code: "", color: "var(--accent)" };
  return { name: s?.name || fallback.name, short: s?.short || fallback.short, code: s?.code || fallback.code, color: s?.color || fallback.color };
}

function heroPreview(store) {
  const chapter = store.chaptersOf("sub-math")[0] || store.state.chapters[0] || null;
  const topics = chapter ? store.nodesOf(chapter.id).slice(0, 3) : [];
  const rows = topics.length
    ? topics.map((t, i) => `<li class="lp-row">
        <span class="lp-check ${i < 2 ? "on" : ""}" aria-hidden="true">${i < 2 ? "✓" : ""}</span>
        <span class="truncate">${esc(t.name)}</span>
        <span class="chip soft">${i < 2 ? "done" : "next"}</span>
      </li>`).join("")
    : `<li class="lp-row"><span class="lp-check on" aria-hidden="true">✓</span><span>Open the syllabus map</span><span class="chip soft">start</span></li>`;
  return `<div class="landing-preview" aria-label="A preview of the study dashboard">
    <div class="row between gap-2">
      <span class="eyebrow">Product preview</span>
      ${chip("CBSE · 2026–27", "acc")}
    </div>
    <div class="lp-head">
      <div class="lp-ring" aria-hidden="true"><span>62<i>%</i></span></div>
      <div>
        <div class="small muted">Board-exam readiness</div>
        <b class="lp-big">${esc(chapter?.name || "Today's plan")}</b>
        <div class="xs faint">${esc(chapter?.unit || "Your syllabus, turned into small steps")}</div>
      </div>
    </div>
    <ul class="lp-list">${rows}</ul>
    <div class="lp-foot">
      <span>🔥 <b>14-day</b> streak</span>
      <span>⚡ <b>1,240</b> XP</span>
      <span>↻ <b>6</b> revisions due</span>
    </div>
  </div>`;
}

let welcomeRazorpayLoading = null;

function loadWelcomeRazorpay() {
  if (window.Razorpay) return Promise.resolve();
  if (welcomeRazorpayLoading) return welcomeRazorpayLoading;
  welcomeRazorpayLoading = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load the payment provider."));
    document.head.appendChild(script);
  });
  return welcomeRazorpayLoading;
}

async function handleWelcomePay() {
  const btn = document.querySelector('[data-welcome-pay]');
  const prev = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "Creating order…"; }
  try {
    const keyId = config.razorpayKeyId;
    if (!keyId) {
      toast("Payments are not configured on this deployment.", "err");
      return;
    }
    const res = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 19900, currency: "INR", receipt: `padhle-welcome_${Date.now()}` }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload?.error || "Could not create the payment order.");
    if (!payload?.order_id) throw new Error("The payment order came back empty.");

    await loadWelcomeRazorpay();
    if (!window.Razorpay) throw new Error("The payment provider did not load.");

    const options = {
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
        await activatePaidAccess({
          paymentId: response.razorpay_payment_id,
          orderId: response.razorpay_order_id,
          signature: response.razorpay_signature,
        });
        try { await initAccount({ force: true }); } catch { /* best effort */ }
        if (!hasPaidAccess()) {
          toast("Payment went through, but access did not stick. Contact support with your payment id.", "warn");
          return;
        }
        shell.ctx?.rerender?.();
        toast("Full access unlocked until 10 March 2027 ✓", "ok");
      },
      modal: { ondismiss: () => toast("Payment wasn't completed. Try again, or contact support if money was debited.", "warn") },
    };
    const rzp = new window.Razorpay(options);
    rzp.open();
  } catch (err) {
    toast(err?.message || "Could not start the payment. Try again.", "err");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = prev; }
  }
}

function openUpgradeModal() {
  const paid = hasPaidAccess();
  if (paid) {
    location.hash = "#/dashboard";
    return;
  }
  const configured = Boolean(config.razorpayKeyId);
  const expiry = "10 March 2027";

  openModal({
    title: "Unlock full access — ₹199",
    hideSubmit: true,
    body: `
      <div class="modal-buy-card">
        <div class="buy-ribbon">limited-time offer</div>
        <h2 class="buy-title">Unlock everything</h2>
        <p class="buy-note">Pay once, no subscription. Full access until <b>${esc(expiry)}</b>, then it reverts to free.</p>
        <div class="buy-actions">
          <button class="btn buy-buy" type="button" data-modal-pay>
            Buy full access →
          </button>
        </div>
        ${!configured ? `<p class="buy-warn" style="text-align:center">Payments not configured on this deployment.</p>` : ""}
      </div>
    `,
    onOpenNoForm: (root) => {
      const btn = root.querySelector('[data-modal-pay]');
      if (btn) {
        btn.addEventListener("click", () => {
          closeModal();
          handleWelcomePay();
        });
      }
    },
  });
}

/**
 * Buy panel — shown ONLY to free (unpaid) students, at the bottom of the
 * welcome page, in the app's looseleaf hand-drawn theme.
 */
function buyPanel(signedIn = true) {
  const paid = hasPaidAccess();
  if (paid) return "";

  const configured = Boolean(config.razorpayKeyId);
  const expiry = "10 March 2027";

  return `
  <section class="welcome-buy">
    <div class="buy-card">
      <div class="buy-ribbon">limited-time offer</div>
      <h2 class="buy-title">Unlock everything — just ₹199</h2>
      <p class="buy-note">Pay once, no subscription. Full access until <b>${esc(expiry)}</b>, then it reverts to free.</p>
      <div class="buy-actions">
        ${signedIn
          ? `<button class="btn buy-buy" type="button" data-welcome-pay>
               Buy full access →
             </button>`
          : `<a class="btn buy-buy" href="#/signup">Create an account to buy <span aria-hidden="true">→</span></a>
             <a class="btn ghost" href="#/login">I already have one</a>`}
      </div>
      ${signedIn ? `<div style="text-align:center;margin-top:10px"><button class="btn ghost sm" type="button" data-welcome-restore>Already paid? Restore access</button></div>` : ""}
      ${signedIn && !configured ? `<p class="buy-warn">Payments not configured on this deployment.</p>` : ""}
      ${!signedIn ? `<p class="buy-note" style="margin-top:10px">Access is tied to your account, so sign in first — then pay and it unlocks instantly.</p>` : ""}
    </div>
  </section>
  `;
}

/**
 * Feature preview grid — shown to free students. Each card is visually
 * disabled (can't interact) with a small "upgrade" hint, so they can see
 * everything the app offers but can't use it until they pay.
 */
function featurePreviews() {
  return `
  <section class="welcome-preview">
    <h2 class="preview-head">Everything you'll unlock</h2>
    <div class="preview-grid">
      ${FEATURES.map((f, i) => `
        <article class="preview-card locked" data-locked>
          <span class="preview-ico">${f.ico}</span>
          <h3>${esc(f.title)}</h3>
          <p class="preview-text">${esc(f.text)}</p>
          <div class="preview-lock">🔒 upgrade</div>
        </article>
      `).join("")}
    </div>
    <p class="preview-note">These tabs are real — once you pay, they all start working instantly.</p>
  </section>
  `;
}

export default {
  id: "welcome",
  title: "Welcome",
  render(ctx) {
    const { store } = ctx;
    const signedIn = isSignedIn();
    const paid = hasPaidAccess();
    const { subjects: subjectCount, chapters: chapterCount, topics: topicCount } = syllabusTotals();
    const allSubjects = ALL_SUBJECT_IDS.map((id) => subjectName(store, id));

    const cta = signedIn
      ? paid
        ? `<a class="btn primary onb-big" href="#/dashboard">Open your dashboard <span aria-hidden="true">→</span></a>`
        : `<a class="btn onb-big" href="#/dashboard" data-open-dashboard>Open your dashboard <span aria-hidden="true">→</span></a>
           <a class="btn onb-big" href="#/settings">Settings</a>`
      : `<a class="btn primary onb-big" href="#/signup">Create your account <span aria-hidden="true">→</span></a>
         <a class="btn onb-big" href="#/login">Log in</a>`;

    const stat = (label, value, sub) => `<div class="landing-stat">
      <span class="faint xs">${esc(label)}</span>
      <b>${esc(value)}</b>${sub ? `<div class="xs faint">${esc(sub)}</div>` : ""}
    </div>`;

    return `<div class="landing">
      <div class="landing-orb o1" aria-hidden="true"></div>
      <div class="landing-orb o2" aria-hidden="true"></div>
      <div class="landing-orb o3" aria-hidden="true"></div>

      <section class="landing-hero">
        <div class="landing-copy">
          <span class="landing-badge"><span class="landing-badge-dot" aria-hidden="true"></span>${esc(TAGLINE)}</span>
          <h1 class="landing-title">Your whole Class 10 syllabus,<br><span class="landing-hl">finally in one place.</span></h1>
          <p class="landing-lead">${esc(brand())} turns the official CBSE Class 10 syllabus into a daily plan you can finish — chapters, checklists, timed sessions, revision and past-paper insight, all in one calm dashboard.</p>
          <div class="landing-actions">${cta}</div>
          <ul class="landing-points">
            <li>✓ Built on the official CBSE 2026–27 syllabus</li>
            <li>✓ Your progress follows you on every device</li>
            <li>✓ No ads, no noise, no fake progress</li>
          </ul>
        </div>
        <div class="landing-visual">
          <div class="landing-visual-glow" aria-hidden="true"></div>
          ${heroPreview(store)}
          <div class="landing-sticker" aria-hidden="true">✦</div>
          <div class="landing-pill" aria-hidden="true">0 ads · no noise</div>
          <div class="landing-buddy" aria-hidden="true">
            ${mascot({ mood: "cheer", size: 92 })}
            <span class="landing-buddy-note">Chotu, your study buddy</span>
          </div>
        </div>
      </section>

      <div class="landing-marquee" aria-hidden="true">
        <div class="landing-marquee-track">
          ${[...allSubjects, ...allSubjects].map((s) => `<span class="landing-marquee-item"><span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}</span>`).join("")}
        </div>
      </div>

      <section class="landing-stats" aria-label="What is inside">
        ${stat("Subjects", fmtNum(subjectCount))}
        ${stat("Chapters", fmtNum(chapterCount))}
        ${stat("Topic checklists", fmtNum(topicCount))}
        ${stat("60-day plan", "60")}
      </section>

      <section class="welcome-preview">
        <h2 class="preview-head">Everything you'll unlock</h2>
        <div class="preview-grid">
          ${FEATURES.map((f, i) => `
            <article class="preview-card locked" data-locked>
              <span class="preview-ico">${f.ico}</span>
              <h3>${esc(f.title)}</h3>
              <p class="preview-text">${esc(f.text)}</p>
              <div class="preview-lock">🔒 upgrade</div>
            </article>
          `).join("")}
        </div>
        <p class="preview-note">These tabs are real — once you pay, they all start working instantly.</p>
      </section>

      <section class="landing-section" aria-labelledby="landing-steps-title">
        <div class="landing-section-head">
          <span class="eyebrow">How it works</span>
          <h2 id="landing-steps-title">Three steps, then it runs itself.</h2>
        </div>
        <div class="landing-steps">
          ${STEPS.map((s) => `<div class="landing-step">
            <span class="landing-step-n">${s.n}</span>
            <h3>${esc(s.title)}</h3>
            <p>${esc(s.text)}</p>
          </div>`).join("")}
        </div>
      </section>

      <section class="landing-section landing-subjects-section" aria-labelledby="landing-subjects-title">
        <div class="landing-section-head">
          <span class="eyebrow">Your subjects</span>
          <h2 id="landing-subjects-title">All eleven subjects. Pick your own mix.</h2>
          <p class="muted">Choose any combination you like — there are no compulsory or elective groups. The dashboard shows only what you pick, and you can change it any time.</p>
        </div>
        <div class="landing-subject-panel">
          <div class="row between gap-2 wrap">
            <h3 style="margin:0">CBSE Class 10 · 2026–27</h3>
            ${chip("Choose any", "ok")}
          </div>
          <div class="landing-subject-list">${allSubjects.map((s) => `<span class="landing-subject">
            <span class="dot" style="background:${esc(s.color)}"></span>${esc(s.name)}${s.code ? `<span class="faint xs">${esc(s.code)}</span>` : ""}
          </span>`).join("")}</div>
        </div>
      </section>

      <section class="landing-cta" aria-label="Get started">
        ${paid ? "" : buyPanel(signedIn)}
        <div>
          <span class="eyebrow">Ready when you are</span>
          <h2>Start with today's plan.</h2>
          <p class="muted">No card, no clutter. Just the syllabus, a plan and a streak worth keeping.</p>
        </div>
        <div class="landing-actions">${cta}</div>
      </section>

      <footer class="landing-foot">
        <div class="landing-foot-brand">${esc(brand())} <span class="faint">${esc(TAGLINE)}</span></div>
        <div class="small muted">A study workspace for CBSE Class 10 · 2026–27</div>
        <div class="row gap-2">
          <a class="small" href="#/login">Log in</a><span class="faint">·</span><a class="small" href="#/signup">Sign up</a>
        </div>
      </footer>
    </div>`;
  },

  mount(ctx) {
    const payBtn = document.querySelector('[data-welcome-pay]');
    if (payBtn && !payBtn.dataset.welcomePayWired) {
      payBtn.dataset.welcomePayWired = "1";
      payBtn.addEventListener("click", handleWelcomePay);
    }

    const restore = document.querySelector('[data-welcome-restore]');
    if (restore && !restore.dataset.welcomeRestoreWired) {
      restore.dataset.welcomeRestoreWired = "1";
      restore.addEventListener("click", async () => {
        const prev = restore.textContent;
        restore.disabled = true;
        restore.textContent = "Checking Razorpay…";
        try {
          await claimPurchase();
          try { await initAccount({ force: true }); } catch { /* best effort */ }
          shell.ctx?.rerender?.();
          toast("Full access restored until 10 March 2027 ✓", "ok");
        } catch (err) {
          toast(err?.message || "Could not restore your purchase.", "err");
        } finally {
          restore.disabled = false;
          restore.textContent = prev;
        }
      });
    }

    // "Open your dashboard" for free users → open upgrade modal
    document.querySelectorAll('[data-open-dashboard]').forEach((el) => {
      if (!el.dataset.dashboardWired) {
        el.dataset.dashboardWired = "1";
        el.addEventListener("click", (ev) => {
          ev.preventDefault();
          openUpgradeModal();
        });
      }
    });

    // Locked feature cards → open upgrade modal
    document.querySelectorAll('[data-locked]').forEach((el) => {
      if (!el.dataset.lockedWired) {
        el.dataset.lockedWired = "1";
        el.addEventListener("click", (ev) => {
          ev.preventDefault();
          openUpgradeModal();
        });
      }
    });

    if (syllabusTotals().subjects) return null;
    let cancelled = false;
    loadPublicCatalogue().then(() => {
      if (!cancelled && syllabusTotals().subjects) ctx.rerender();
    });
    return () => { cancelled = true; };
  },
};
