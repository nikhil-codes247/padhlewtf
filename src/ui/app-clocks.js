/**
 * app-clocks.js — global timer display and midnight reset.
 *
 * tickGlobalTimer() updates the running-timer chip in the topbar.
 * startClocks() starts the 1-second tick and the midnight date check.
 * Uses shared state from app-state.js (store, ctx).
 */
import { store } from "../core/store.js?v=mwz8hppl";
import { todayISO } from "../core/dates.js?v=mwz8hppl";
import { shell } from "./app-state.js?v=mwz8hppl";
import { renderRoute } from "../app.js?v=mwz8hppl";

export function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return hh ? `${hh}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

export function tickGlobalTimer() {
  const host = document.querySelector("[data-global-timer]");
  if (!host) return;
  const t = store.state.settings.timer;
  if (!t?.running) {
    if (host.childElementCount) host.innerHTML = "";
    return;
  }
  if (!host.querySelector(".js-timer-chip")) {
    host.innerHTML = `<a class="chip acc js-timer-chip" href="#/timer" title="A session is running — open the timer">
      <span aria-hidden="true">⏱</span><b class="js-timer-time mono">0:00</b><span class="js-timer-state xs"></span></a>`;
  }
  const timeEl = host.querySelector(".js-timer-time");
  const stateEl = host.querySelector(".js-timer-state");
  if (timeEl) timeEl.textContent = clock(store.timerElapsedMs());
  if (stateEl) stateEl.textContent = t.paused ? "paused" : "";
}

export function startClocks() {
  setInterval(tickGlobalTimer, 1000);
  // keep "today" correct across midnight without a reload
  let lastToday = todayISO();
  setInterval(() => {
    const now = todayISO();
    if (now !== lastToday) {
      lastToday = now;
      if (shell.ctx) shell.ctx.today = now;
      renderRoute("midnight");
    }
  }, 60000);
}
