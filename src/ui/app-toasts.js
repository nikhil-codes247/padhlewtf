/**
 * app-toasts.js — toast notification system.
 *
 * Renders short-lived status messages in the toast root. Max four at a time.
 * Info/ok messages dismiss after 5s, warnings after 7s and errors after 9s —
 * unless the pointer or keyboard focus is inside the toast, in which case the
 * countdown pauses so nobody loses a message while reading it.
 *
 * The visible glyph mirrors the old bare-text toast, but the kind label and
 * progress bar make the state legible without relying on colour alone.
 */
import { h, esc } from "./dom.js?v=mwz1qwqk";

const LIFE = { ok: 5000, info: 5000, warn: 7000, err: 9000 };
const META = {
  ok: { icon: "✓", label: "Done", role: "status" },
  info: { icon: "i", label: "Note", role: "status" },
  warn: { icon: "!", label: "Heads up", role: "status" },
  err: { icon: "!", label: "Problem", role: "alert" },
};

export function toast(msg, kind = "info") {
  const root = document.getElementById("toast-root");
  if (!root) return;
  const type = META[kind] ? kind : "info";
  const meta = META[type];
  const life = LIFE[type];

  while (root.children.length >= 4) root.firstElementChild.remove();

  const el = h(`<div class="toast ${esc(type)}" role="${meta.role}" style="--toast-life:${life}ms">
    <span class="toast-ico" aria-hidden="true">${meta.icon}</span>
    <div class="toast-body">
      <b class="toast-kind">${esc(meta.label)}</b>
      <div class="toast-msg">${esc(msg)}</div>
    </div>
    <button type="button" class="btn sm ghost toast-close" aria-label="Dismiss notification">✕</button>
    <span class="toast-life" aria-hidden="true"></span>
  </div>`);

  let timer = null;
  let remaining = life;
  let started = 0;

  const remove = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    el.classList.add("toast-out");
    // Wait for the exit animation, but never trap the node if it is disabled.
    const reduced = document.documentElement.dataset.reduceMotion === "true";
    setTimeout(() => el.remove(), reduced ? 0 : 180);
  };

  const start = () => {
    if (timer || remaining <= 0) return;
    started = Date.now();
    el.classList.remove("paused");
    timer = setTimeout(remove, remaining);
  };

  const pause = () => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    remaining -= Date.now() - started;
    el.classList.add("paused");
  };

  const resume = () => {
    if (el.classList.contains("toast-out")) return;
    start();
  };

  el.querySelector(".toast-close")?.addEventListener("click", remove);
  el.addEventListener("pointerenter", pause);
  el.addEventListener("pointerleave", resume);
  el.addEventListener("focusin", pause);
  el.addEventListener("focusout", (e) => {
    if (!el.contains(e.relatedTarget)) resume();
  });

  root.appendChild(el);
  start();

  // Optional modern announcement API. The container remains the fallback
  // (role="status"/"alert"), which is why this is only a progressive extra.
  try {
    if (typeof document.ariaNotify === "function") {
      document.ariaNotify(`${meta.label}: ${msg}`, { priority: type === "err" ? "assertive" : "normal" });
    }
  } catch { /* announcements are best-effort */ }

  return el;
}
