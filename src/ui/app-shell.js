/**
 * app-shell.js — app and public shell rendering.
 *
 * Renders the two chrome layouts: the public shell (landing/auth/setup) and
 * the app shell (sidebar + workspace). Uses shared state from app-state.js.
 *
 * The markup stays deliberately plain: all styling lives in the stylesheets,
 * every interactive control keeps its `data-act` hook, and the IDs used by the
 * router, tests and keyboard shortcuts (#nav, #main, #global-search, …) never
 * move.
 */
import { esc, debounce } from "./dom.js?v=mwz8yitl";
import { brand, TAGLINE } from "../core/branding.js?v=mwz8yitl";
import { account, isSignedIn, hasProfile, hasSelection, accountUsername, accountEmail } from "../core/account.js?v=mwz8yitl";
import { store } from "../core/store.js?v=mwz8yitl";
import { renderNav } from "./app-nav.js?v=mwz8yitl";
import { shell, ui } from "./app-state.js?v=mwz8yitl";
import { inkUnderline } from "./ink.js?v=mwz8yitl";
import { bootDoodles } from "./boot-doodles.js?v=mwz8yitl";

const PUBLIC_ROUTES = new Set(["welcome", "login", "signup"]);
const SETUP_ROUTES = new Set(["set-username", "choose-subjects"]);

export function ensureShell(mode, renderRoute) {
  if (shell.mode === mode && document.getElementById("main")) return;
  shell.mode = mode;
  if (mode === "public") renderPublicShell();
  else renderShell(renderRoute);
}

export function shellFor(name) {
  return PUBLIC_ROUTES.has(name) || SETUP_ROUTES.has(name) ? "public" : "app";
}

export function renderPublicShell() {
  const app = document.getElementById("app");
  app.classList.remove("is-app-shell");
  const signed = isSignedIn();
  const complete = signed && hasProfile() && hasSelection();
  const identity = accountUsername() ? `@${accountUsername()}` : accountEmail();
  app.innerHTML = `
    <div class="public-shell">
      <header class="public-top">
        <a class="public-brand brand-header public-brand-header" href="${signed ? "#/dashboard" : "#/welcome"}">
          <span class="sidebar-brand">
            <span class="brand-name">PADHLE</span><span class="brand-dot">.</span><span class="brand-wtf">WTF</span>
          </span>
          ${inkUnderline({ width: 150, height: 10, seed: "brand", className: "ink-brand" })}
          <div class="brand-tagline">${esc(TAGLINE)}</div>
        </a>
        <div class="public-top-actions">
          ${signed
            ? `<span class="chip soft public-identity" title="${esc(accountEmail())}">${esc(identity)}</span>
               ${complete ? `<a class="btn sm primary" href="#/dashboard">Open app</a>` : ""}
               <button class="btn sm" type="button" data-act="auth-signout">Sign out</button>`
            : `<a class="btn sm" href="#/login">Log in</a><a class="btn sm primary" href="#/signup">Sign up</a>`}
          <button class="btn icon sm" type="button" data-act="theme-toggle" aria-label="Switch theme" title="Switch theme">◐</button>
        </div>
      </header>
      <main id="main" class="public-main" tabindex="-1"></main>
      <footer class="public-foot">
        <span>${esc(brand())} · ${esc(TAGLINE)}</span>
        <span class="grow"></span>
        ${signed
          ? `<a class="small" href="#/welcome">Home</a><span class="faint">·</span><a class="small" href="#/settings">Settings</a>`
          : `<a class="small" href="#/welcome">Home</a><span class="faint">·</span><a class="small" href="#/login">Log in</a>`}
      </footer>
    </div>`;
  shell.viewEl = document.getElementById("main");
}

export function renderAccountGate() {
  if (!shell.viewEl) return;
  if (account.loadError) {
    shell.viewEl.innerHTML = `<div class="account-gate"><section class="card auth-card">
      <span class="eyebrow">Account</span>
      <h1>We could not open your profile.</h1>
      <p class="muted">${esc(account.loadError)}</p>
      <div class="row wrap gap-2">
        <button class="btn primary" type="button" data-act="account-retry">Try again</button>
        <button class="btn" type="button" data-act="auth-signout">Sign out</button>
      </div>
    </section></div>`;
    return;
  }
  shell.viewEl.innerHTML = `<div class="account-gate">${bootDoodles()}<div class="boot-card" role="status" aria-live="polite">
    <div class="brand-header boot-brand">
      <span class="sidebar-brand">
        <span class="brand-name">PADHLE</span><span class="brand-dot">.</span><span class="brand-wtf">WTF</span>
      </span>
      ${inkUnderline({ width: 150, height: 10, seed: "brand", className: "ink-brand" })}
      <div class="brand-tagline">${esc(TAGLINE)}</div>
    </div>
    <div class="boot-progress" aria-hidden="true"><span></span></div>
    <p class="boot-status">Opening your study workspace…</p>
  </div></div>`;
}

export function renderShell(renderRoute) {
  const app = document.getElementById("app");
  app.classList.add("is-app-shell");
  const settings = store.state.settings;
  const streakDays = settings.streakDays || store.derived?.gamification?.streak?.current || 0;
  const level = store.derived?.gamification?.level || { level: 1, title: "Rookie" };
  const points = store.derived?.gamification?.points ?? 0;
  const xpPct = Math.max(0, Math.min(100, Math.round(((level.intoLevel || 0) / Math.max(1, level.needed || 1)) * 100)));
  const todayQualified = !!store.derived?.gamification?.todayQualified;
  const avatarEmoji = account.profile?.avatar || "🦉";
  const displayName = account.profile?.displayName || settings.displayName || "Student";
  const username = accountUsername();
  const email = accountEmail();
  const identity = username ? `@${username}` : email;

  app.innerHTML = `
    <div class="app-shell${!ui.sidebarOpen ? " sidebar-collapsed" : ""}">
      <aside class="sidebar${!ui.sidebarOpen ? " collapsed" : ""}" aria-label="Primary navigation">
        <div class="brand-header">
          <a class="sidebar-brand" href="#/dashboard" aria-label="${esc(brand())} dashboard">
            <span class="brand-name">PADHLE</span><span class="brand-dot">.</span><span class="brand-wtf">WTF</span>
          </a>
          ${inkUnderline({ width: 150, height: 10, seed: "brand", className: "ink-brand" })}
          <div class="brand-tagline">Work Towards Finals 💀</div>
          <button class="btn icon sm sidebar-close" type="button" data-act="nav-close" aria-label="Close navigation">✕</button>
        </div>

        <nav class="nav" id="nav" aria-label="Study workspace"></nav>

        <div class="sidebar-foot">
          <a class="sidebar-cta" href="#/timer">
            <span class="sidebar-cta-ico" aria-hidden="true">◷</span>
            <span class="sidebar-cta-text"><b>Start a session</b><small>Focus timer</small></span>
            <span class="sidebar-cta-arrow" aria-hidden="true">→</span>
          </a>
          <div class="sidebar-hint">
            <div class="sidebar-level">
              <span>Level ${esc(level.level)} · ${esc(level.title)}</span>
              <span>${esc(String(points))} XP</span>
            </div>
            <div class="sidebar-xp" role="progressbar" aria-label="Progress to the next level" aria-valuenow="${xpPct}" aria-valuemin="0" aria-valuemax="100">
              <span style="width:${xpPct}%"></span>
            </div>
          </div>
        </div>
      </aside>

      <button class="nav-scrim" type="button" data-act="nav-close" aria-label="Close navigation menu" tabindex="-1"></button>

      <div class="workspace">
        <header class="topbar">
          <div class="topbar-lead">
            <button class="btn icon sidebar-toggle" type="button" data-act="sidebar-toggle" aria-label="Toggle navigation" aria-controls="nav" aria-expanded="${ui.sidebarOpen ? "true" : "false"}">☰</button>
            <div class="topbar-title">
              <div class="crumb" data-crumb></div>
              <h1 data-title></h1>
            </div>
          </div>

          <div class="topbar-actions">
            <div data-global-timer class="topbar-timer row gap-2"></div>

            <div class="topbar-search">
              <span class="topbar-search-ico" aria-hidden="true">⌕</span>
              <input id="global-search" class="input pill" type="search" placeholder="Search…" title="Search everything (press /)" aria-label="Search everything"
                     autocomplete="off" spellcheck="false" value="${esc(ui.q)}">
              <kbd class="topbar-kbd" aria-hidden="true">/</kbd>
            </div>

            <button class="btn icon theme-btn" type="button" data-act="theme-toggle" title="Switch theme" aria-label="Switch theme">◐</button>

            <div class="topbar-streak" title="${streakDays} day study streak · ${todayQualified ? "today counts" : "log a session to count today"}">
              <span class="streak-emoji" aria-hidden="true">🔥</span>
              <span class="streak-val"><b>${streakDays}</b><span class="streak-word"> day${streakDays === 1 ? "" : "s"}</span></span>
            </div>

            <div class="avatar-menu">
              <button class="btn icon avatar-btn" type="button" data-act="avatar-toggle" title="Account menu" aria-label="Account menu" aria-haspopup="menu" aria-expanded="false" aria-controls="avatar-popup">
                <span class="avatar-emoji" aria-hidden="true">${esc(avatarEmoji)}</span>
                ${todayQualified ? `<span class="avatar-dot" aria-hidden="true"></span>` : ""}
              </button>
              <div class="avatar-popup" id="avatar-popup" role="menu" aria-label="Account menu">
                <div class="avatar-popup-id" role="none">
                  <span class="avatar-popup-emoji" aria-hidden="true">${esc(avatarEmoji)}</span>
                  <span class="avatar-popup-meta">
                    <b>${esc(displayName)}</b>
                    <small>${esc(identity)}</small>
                  </span>
                </div>
                <a href="#/profile" class="avatar-popup-item" role="menuitem">
                  <span class="ico" aria-hidden="true">✦</span><span>Profile &amp; Streaks</span>
                </a>
                <a href="#/settings" class="avatar-popup-item" role="menuitem">
                  <span class="ico" aria-hidden="true">⚙</span><span>Settings</span>
                </a>
                <div class="avatar-popup-sep" role="separator"></div>
                <button type="button" class="avatar-popup-item danger" data-act="auth-signout" role="menuitem">
                  <span class="ico" aria-hidden="true">⏻</span><span>Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </header>
        <div class="band" aria-hidden="true"></div>
        <main id="main" class="view" tabindex="-1"></main>
      </div>
    </div>
    <footer class="app-footer small muted">
      ${esc(brand())} · ${esc(TAGLINE)} · <a href="#/settings">settings</a>
    </footer>
  `;
  shell.viewEl = document.getElementById("main");

  const gs = document.getElementById("global-search");
  if (gs) {
    // Keep the input in sync with ui.q (e.g. when arriving via #/search?q=…)
    gs.value = ui.q || "";

    gs.addEventListener("input", debounce(() => {
      ui.q = gs.value;
      // Always navigate to the search page so results render there.
      const next = ui.q ? `#/search?q=${encodeURIComponent(ui.q)}` : "#/search";
      const wasSearch = location.hash.replace(/\?.*$/, "") === "#/search";
      location.hash = next;
      // If already on /search, hashchange won't fire — force a re-render.
      if (wasSearch) renderRoute("search");
    }, 220));

    gs.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        ui.q = gs.value;
        location.hash = ui.q ? `#/search?q=${encodeURIComponent(ui.q)}` : "#/search";
      }
    });
  }

  renderNav();
}

export { shell };
