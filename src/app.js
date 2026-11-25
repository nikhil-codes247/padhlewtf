/**
 * app.js — boot, shell, router, event delegation, modal / toast / confirm
 * infrastructure, chart tooltips and keyboard shortcuts.
 *
 * Data flow: user event -> ACTIONS (mutates store) -> store emits -> renderRoute
 * re-renders the current view. Views are pure functions of the store; nothing in
 * a view reaches into the DOM to change data.
 *
 * This file is the orchestrator: it imports view modules and UI infrastructure
 * modules, wires them together in main(), and exports renderRoute for use by
 * split-out modules (clocks, events, shells).
 */
import { store } from "./core/store.js";
import { todayISO } from "./core/dates.js";
import { esc, h } from "./ui/dom.js";
import { ACTIONS } from "./ui/actions.js";
Object.assign(ACTIONS, FlashcardActions.ACTIONS, QuestionActions.ACTIONS, BoardExamActions);
import { brand, TAGLINE } from "./core/branding.js";
import { nativeTheme } from "./core/native.js";
import {
  account, initAccount, isSignedIn, subscribeAccount, hasPaidAccess, accountEmail,
} from "./core/account.js";
import { isPaidRoute } from "./ui/app-router.js";
import { config } from "./core/config.js";
/* ------------------------------------------------------------- views --- */
import dashboardView from "./ui/views/dashboard.js";
import syllabusView from "./ui/views/syllabus.js";
import curriculumView from "./ui/views/curriculum.js";
import subjectView from "./ui/views/subject.js";
import chapterView from "./ui/views/chapter.js";
import plannerView from "./ui/views/planner.js";
import timerView from "./ui/views/timer.js";
import FlashcardsView from "./features/revision/ui/flashcards-view.js";
import QuestionsView from "./features/revision/ui/questions-view.js";
import * as FlashcardActions from "./features/revision/ui/flashcards-view.js";
import * as QuestionActions from "./features/revision/ui/questions-view.js";
import revisionView from "./ui/views/revision.js";
import analyticsView from "./ui/views/analytics.js";
import calendarView from "./ui/views/calendar.js";
import settingsView from "./ui/views/settings.js";
import searchView from "./ui/views/search.js";
import profileView from "./ui/views/profile.js";
import pyqView from "./ui/views/pyq.js";
import roadmapView from "./ui/views/roadmap.js";
import accountView from "./ui/views/account.js";
import welcomeView from "./ui/views/welcome.js";
import authView from "./ui/views/auth.js";
import usernameView from "./ui/views/username.js";
import chooseSubjectsView from "./ui/views/chooseSubjects.js";
import boardExamsView, { BoardExamActions } from "./ui/views/boardExams.js";
import { renderOnboarding } from "./ui/onboarding.js";
import notesView from "./ui/views/notes.js";

/* ------------------------------------------------------------- ui infra --- */
import { ui, shell } from "./ui/app-state.js";
import { parseHash, gateTarget } from "./ui/app-router.js";
import { renderNav } from "./ui/app-nav.js";
import {
  ensureShell, shellFor, renderAccountGate,
} from "./ui/app-shell.js";
import { openModal, closeModal, confirm } from "./ui/app-modals.js";
import { toast } from "./ui/app-toasts.js";
import { captureFocus, restoreFocus } from "./ui/app-focus.js";
import { tickGlobalTimer, startClocks } from "./ui/app-clocks.js";
import {
  hydrateRemoteSettings, scheduleSettingsPush, resetSettingsSync, remoteSettingsReady,
} from "./ui/app-settings-sync.js";
import { connectNativeShell } from "./ui/app-native.js";
import { renderFatal } from "./ui/app-fatal.js";
import { initEvents } from "./ui/app-events.js";
import { initSkin } from "./ui/app-skin.js";
import { initDelight, resetDelight } from "./ui/app-delight.js";
import { resetMoments } from "./ui/app-moments.js";

/* --------------------------------------------------------------- boot ----- */
const ROUTES = {
  welcome: { view: welcomeView, title: "Welcome", crumb: "" },
  login: { view: authView, title: "Log in", crumb: "Account" },
  signup: { view: authView, title: "Create account", crumb: "Account" },
  "set-username": { view: usernameView, title: "Your profile", crumb: "Account" },
  "choose-subjects": { view: chooseSubjectsView, title: "Choose subjects", crumb: "Account" },
  dashboard: { view: dashboardView, title: "Dashboard", crumb: "Overview" },
  syllabus: { view: syllabusView, title: "My Syllabus", crumb: "Plan" },
  curriculum: { view: curriculumView, title: "Syllabus Map", crumb: "Plan" },
  subject: { view: subjectView, title: "Subject", crumb: "My Syllabus" },
  chapter: { view: chapterView, title: "Chapter", crumb: "My Syllabus" },
  planner: { view: plannerView, title: "Daily Planner", crumb: "Plan" },
  timer: { view: timerView, title: "Study Timer", crumb: "Do" },
  revision: { view: revisionView, title: "Revision Center", crumb: "Review" },
  flashcards: { view: FlashcardsView, title: "Flashcards", crumb: "Review" },
  "practice-questions": { view: QuestionsView, title: "Practice Questions", crumb: "Review" },
  notes: { view: notesView, title: "Doubts & Notes", crumb: "Capture" },
  analytics: { view: analyticsView, title: "Analytics", crumb: "Review" },
  pyq: { view: pyqView, title: "PYQ Insights", crumb: "Review" },
  profile: { view: profileView, title: "Profile & Streaks", crumb: "Progress" },
  calendar: { view: calendarView, title: "Calendar", crumb: "Plan" },
  "board-exams": { view: boardExamsView, title: "Board Exams", crumb: "Plan" },
  roadmap: { view: roadmapView, title: "What's New?", crumb: "System" },
  account: { view: accountView, title: "Account", crumb: "System" },
  settings: { view: settingsView, title: "Settings", crumb: "System" },
  search: { view: searchView, title: "Search", crumb: "Everything" },
};

async function main() {
  // Looseleaf is the only design — apply it at boot.
  initSkin();
  try {
    await store.init();
  } catch (err) {
    renderFatal(err);
    return;
  }
  applyThemeAndMotion();
  // A brand-new install lands on the Welcome page. The tour starts once they
  // open the dashboard.
  if (!store.state.settings.onboarded && !location.hash) {
    location.hash = "#/welcome";
  }
  window.addEventListener("hashchange", () => {
    // `#main` (the skip link) and any other in-page anchor is not a route —
    // leave it to the browser so the link still jumps to the content.
    const h = location.hash;
    if (h && h !== "#/" && !h.startsWith("#/")) return;
    // Following a link inside the mobile drawer should close it.
    document.body.classList.remove("nav-open");
    document.querySelector('[data-act="sidebar-toggle"]')?.setAttribute("aria-expanded", "false");
    renderRoute("hash");
  });
  store.subscribe(() => {
    scheduleSettingsPush();
    renderRoute("store");
  });
  subscribeAccount(async () => {
    // The public header shows the signed-in identity, so rebuild it whenever
    // the account state changes. Never carry one student's unfinished profile
    // form into another session.
    resetDelight();
    resetMoments();
    if (!isSignedIn()) {
      ui.profileDraft = null;
      ui.subjectDraft = null;
      resetSettingsSync();
    }
    shell.mode = null;
    syncAccountProfile();
    if (isSignedIn() && account.ready) {
      // Reloading the study data must never strand the UI on a blank shell: if
      // a read fails, say so and still render so the student can retry.
      try {
        await store.reload();
      } catch (err) {
        console.error("[padhle] study data reload failed", err);
        toast("Could not load your saved data. Check your connection, then reload.", "err");
      }
    }
    if (isSignedIn() && account.ready && !remoteSettingsReady) {
      try { await hydrateRemoteSettings(); } catch { /* preferences are non-fatal */ }
    }
    renderRoute("account");
  });
  renderRoute("boot");
  startClocks();
  connectNativeShell();
  initEvents();
  initDelight();

  // Restore the Supabase session before deciding which screen is allowed.
  // The gate renders a small loading state while this is in flight.
  initAccount()
    .then(async () => {
      await hydrateRemoteSettings();
      syncAccountProfile();
      renderRoute("account");
    })
    .catch((err) => {
      console.error("[padhle] account restore failed", err);
      renderRoute("account");
    });
}

/** Copy the Supabase profile into the local profile so every view agrees. */
function syncAccountProfile() {
  const p = account.profile;
  if (!p) return;
  const key = `${p.displayName}|${p.avatar}`;
  if (key === shell.syncedProfileKey) return;
  shell.syncedProfileKey = key;
  const s = store.state.settings;
  if (s.displayName !== p.displayName || s.avatar !== p.avatar) {
    store.setProfile({ displayName: p.displayName, avatar: p.avatar }).catch(() => {});
  }
}

/* -------------------------------------------------------------- router ---- */
function makeCtx(route) {
  return {
    store,
    ui,
    route,
    params: route.params,
    today: todayISO(),
    toast,
    confirm,
    openModal,
    closeModal,
    navigate(hash) {
      if (location.hash === hash) renderRoute("manual");
      else location.hash = hash;
    },
    rerender() { renderRoute("rerender"); },
    refresh() { renderRoute("refresh"); },
  };
}

/**
 * Renders a full-screen lock overlay over paid content for free (non-paid)
 * students. The nav bar and shell stay visible; only the tab content is
 * blurred with a big lock icon, skeleton placeholders (no real data), and an
 * upgrade CTA.
 */
function renderLockedView(routeName) {
  const routeLabels = {
    dashboard: "Dashboard",
    syllabus: "My Syllabus",
    curriculum: "Syllabus Map",
    subject: "Subject",
    chapter: "Chapter",
    planner: "Daily Planner",
    timer: "Study Timer",
    revision: "Revision Center",
    flashcards: "Flashcards",
    "practice-questions": "Practice Questions",
    notes: "Doubts & Notes",
    analytics: "Analytics",
    pyq: "PYQ Insights",
    calendar: "Calendar",
    "board-exams": "Board Exams",
    roadmap: "What's New?",
    search: "Search",
  };
  const label = routeLabels[routeName] || routeName;

  return `
  <div class="locked-view" data-locked-route="${esc(routeName)}">
    <div class="locked-backdrop" aria-hidden="true"></div>
    <div class="locked-skeletons" aria-hidden="true">
      <div class="skeleton-line skeleton-title"></div>
      <div class="skeleton-line skeleton-subtitle"></div>
      <div class="skeleton-grid">
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
        <div class="skeleton-block"></div>
      </div>
      <div class="skeleton-line skeleton-footer"></div>
      <div class="skeleton-line skeleton-footer"></div>
    </div>
    <div class="locked-card">
      <div class="lock-icon">🔒</div>
      <h2 class="locked-title">Upgrade to access <span class="locked-route">${esc(label)}</span></h2>
      <p class="locked-note">This feature is part of full access. Pay once — ₹199 — and unlock everything until 10 March 2027.</p>
      <button class="btn locked-btn" type="button" data-upgrade-pay>Buy full access →</button>
      <p class="locked-hint">Already paid? Sign in again or contact support.</p>
    </div>
  </div>
  `;
}

export function renderRoute(reason) {
  const requested = parseHash();
  let route = requested;
  const gate = gateTarget(requested.name);

  if (gate === "loading") {
    ensureShell("public", renderRoute);
    renderAccountGate();
    document.title = `Opening… · ${brand()}`;
    return;
  }
  if (gate && gate !== route.name) {
    const target = `#/${gate}`;
    if (location.hash !== target) {
      // Let the hashchange handler do the render so state and URL stay in step.
      location.hash = target;
      return;
    }
    route = { ...requested, name: gate, params: [] };
  }

  // Expose the current route to CSS. The pilot skin is global, but this lets a
  // future route-by-route rollout opt in (html[data-route="timer"] …).
  document.documentElement.setAttribute("data-route", route.name);

  ensureShell(shellFor(route.name), renderRoute);
  if (!shell.viewEl) return;
  const def = ROUTES[route.name] || ROUTES.dashboard;
  const view = def.view;

  ui._tagIndex = new Map(store.state.tags.map((t) => [t.label, t]));
  ui._tags = store.state.tags;
  if (route.name === "search" && route.query.get("q") !== null) ui.q = route.query.get("q");

  shell.ctx = makeCtx(route);
  const snap = captureFocus();

  if (typeof shell.cleanupView === "function") { try { shell.cleanupView(); } catch { /* ignore */ } }

  shell.cleanupView = null;

  let html = "";
  try {
    html = view.render(shell.ctx);
  } catch (err) {
    console.error("[padhle] view failed to render", err);
    html = `<section class="card"><h2>This page hit an error</h2>
      <p class="muted">The rest of your data is safe. ${esc(err?.message || "Unknown error")}</p>
      <div class="row gap-2"><a class="btn primary" href="#/dashboard">Back to the dashboard</a>
      <button class="btn" data-act="theme-toggle">Toggle theme</button></div></section>`;
  }
  // Lock paid content for free (non-paid) students: blur + big lock +
  // skeleton placeholders (no real data). Nav bar and shell stay visible.
  const paid = hasPaidAccess();
  if (!paid && isPaidRoute(route.name)) {
    shell.viewEl.innerHTML = renderLockedView(route.name);
    // Wire the upgrade button inside the locked overlay.
    const btn = shell.viewEl.querySelector('[data-upgrade-pay]');
    if (btn && !btn.dataset.upgradeWired) {
      btn.dataset.upgradeWired = "1";
      btn.addEventListener("click", () => {
        const keyId = config.razorpayKeyId;
        if (!keyId) {
          toast("Payments are not configured on this deployment.", "err");
          return;
        }
        const prev = btn.textContent;
        btn.disabled = true;
        btn.textContent = "Creating order…";
        fetch("/api/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ amount: 19900, currency: "INR", receipt: `padhle-locked_${Date.now()}` }),
        })
          .then((r) => r.json().catch(() => ({})))
          .then(async (payload) => {
            if (!payload?.order_id) throw new Error("The payment order came back empty.");
            // Load Razorpay checkout script if not already loaded.
            if (!window.Razorpay) {
              await new Promise((resolve, reject) => {
                const s = document.createElement("script");
                s.src = "https://checkout.razorpay.com/v1/checkout.js";
                s.async = true;
                s.onload = () => resolve();
                s.onerror = () => reject(new Error("Could not load the payment provider."));
                document.head.appendChild(s);
              });
            }
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
                const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = response;
                const headers = { "Content-Type": "application/json" };
                const token = account.session?.access_token;
                if (token) headers.Authorization = `Bearer ${token}`;
                const vres = await fetch("/api/verify-payment", { method: "POST", headers, body: JSON.stringify({ razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature }) });
                const vbody = await vres.json().catch(() => ({}));
                if (!vres.ok || !vbody.ok) {
                  throw new Error(vbody?.error || "Payment could not be verified. If money was debited, contact support — it will be refunded.");
                }
                try { await initAccount({ force: true }); } catch { /* best effort */ }
                shell.ctx?.rerender?.();
                toast("Full access unlocked until 10 March 2027 ✓", "ok");
              },
              modal: { ondismiss: () => toast("Payment wasn't completed. Try again, or contact support if money was debited.", "warn") },
            };
            const rzp = new window.Razorpay(options);
            rzp.open();
          })
          .catch((err) => { toast(err?.message || "Could not start the payment. Try again.", "err"); })
          .finally(() => { btn.disabled = false; btn.textContent = prev; });
      });
    }
    // Skip view.mount for locked routes — no real data or interactions.
    updateChrome(route, def);
    applyThemeAndMotion();
    renderNav();
    restoreFocus(snap);
    if (reason === "hash") {
      window.scrollTo({ top: 0, left: 0 });
      if (shell.viewEl) shell.viewEl.scrollTop = 0;
    }
    tickGlobalTimer();
    syncOnboarding();
    return;
  }

  shell.viewEl.innerHTML = html;

  // Route changes get a short entrance; data updates inside a route (a tick, a
  // filter keystroke, a re-render) must never replay it. Keeping this here means
  // every view benefits without touching individual view modules.
  const quietRender = reason === "store" || reason === "filter" || reason === "rerender" || reason === "refresh" || reason === "search";
  if (shell.viewEl) {
    shell.viewEl.classList.remove("route-enter");
    if (!quietRender) {
      // Force a reflow so the class change restarts the animation even when the
      // container is reused. (A no-op in jsdom, where offsetWidth is 0.)
      void shell.viewEl.offsetWidth;
      shell.viewEl.classList.add("route-enter");
    }
  }

  if (typeof view.mount === "function") {
    try { shell.cleanupView = view.mount(shell.ctx) || null; } catch (err) { console.error("[padhle] mount failed", err); }
  }

  updateChrome(route, def);
  applyThemeAndMotion();
  renderNav();
  restoreFocus(snap);
  if (reason === "hash") {
    // The app shell scrolls inside #main, not the window, so reset both.
    window.scrollTo({ top: 0, left: 0 });
    if (shell.viewEl) shell.viewEl.scrollTop = 0;
  }
  tickGlobalTimer();
  syncOnboarding();
}

function updateChrome(route, def) {
  const titleEl = document.querySelector("[data-title]");
  const crumbEl = document.querySelector("[data-crumb]");
  let title = def.title;
  let crumb = def.crumb || "";
  if (route.name === "subject") {
    const s = store.subject(route.params[0]);
    title = s ? s.name : "Subject not found";
    crumb = "My Syllabus";
  } else if (route.name === "chapter") {
    const c = store.chapter(route.params[0]);
    const s = c ? store.subject(c.subjectId) : null;
    title = c ? c.name : "Chapter not found";
    crumb = s ? `My Syllabus · ${s.short || s.name}` : "My Syllabus";
  } else if (route.name === "planner") {
    const date = route.params[0];
    if (date) crumb = `Planner · ${date}`;
  } else if (route.name === "search") {
    title = ui.q ? `Search: “${ui.q}”` : "Search";
  }
  if (titleEl) titleEl.textContent = title;
  if (crumbEl) crumbEl.textContent = crumb;
  document.title = route.name === "welcome" ? `${brand()} — ${TAGLINE}` : `${title} · ${brand()}`;
}

function applyThemeAndMotion() {
  const s = store.state.settings;
  const theme = s.theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.reduceMotion = s.reduceMotion ? "true" : "false";
  // Keep the mobile browser chrome in step with the desk colour.
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#a8c8bb" : "#232a24");
  // Inside the Android app, keep the system bars the same colour as the shell
  // so the status bar does not read as a seam. No-op in a browser.
  nativeTheme(theme);
}

/* ----------------------------------------------------------- onboarding --- */
/**
 * Show the welcome tour only while `settings.onboarded` is false. It lives outside
 * `#main` so it can cover the whole app without fighting the router, and it is
 * re-rendered from the store, so finishing it (or any settings change) hides it.
 */
function syncOnboarding() {
  let root = document.getElementById("onboarding-root");
  if (!root) {
    root = document.createElement("div");
    root.id = "onboarding-root";
    document.body.appendChild(root);
  }
  // Never cover the landing/auth/setup screens. The tour belongs to the app.
  if (!shell.ctx || shell.mode !== "app" || store.state.settings.onboarded) {
    if (root.childElementCount) root.innerHTML = "";
    document.body.classList.remove("onb-open");
    return;
  }
  document.body.classList.add("onb-open");
  root.innerHTML = renderOnboarding(shell.ctx);
}

const booted = main();

// exported for the jsdom integration test
export { booted, ui, parseHash };
