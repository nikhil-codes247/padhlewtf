/**
 * app-delight.js — earned-moment celebrations.
 *
 * The app already records points, levels and achievements. This module watches
 * the derived gamification snapshot and celebrates only *changes*: a level-up
 * or a newly reached achievement. Nothing here mints points, schedules work or
 * creates a loop — refreshing the page can never trigger a celebration.
 *
 * Motion is opt-in: with reduced motion enabled the same moment is announced
 * by a toast instead of confetti.
 */
import { store } from "../core/store.js?v=mwz1jos9";
import { toast } from "./app-toasts.js?v=mwz1jos9";

const CONFETTI_COLOURS = [
  "var(--ll-sticky-yellow)",
  "var(--ll-sticky-pink)",
  "var(--ll-sticky-blue)",
  "var(--ll-sticky-green)",
  "var(--ll-sticky-orange)",
  "var(--ll-marker)",
];

let snapshot = null;
let armedAt = 0;
let lastCelebration = 0;

function readSnapshot() {
  const g = store.derived?.gamification;
  if (!g) return null;
  return {
    level: g.level?.level || 1,
    points: g.points || 0,
    achievements: new Set((g.achievements || []).filter((a) => a.reached).map((a) => a.key)),
    achievementList: g.achievements || [],
  };
}

function prefersReducedMotion() {
  if (document.documentElement.dataset.reduceMotion === "true") return true;
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

/**
 * Paint a short, non-blocking confetti burst plus the matching toast.
 * Safe to call from anywhere; it never throws if the DOM is unavailable.
 */
export function celebrate({ title = "Nice work", text = "", icon = "✦", kind = "ok" } = {}) {
  if (!title) return;
  const message = text ? `${title} — ${text}` : title;
  toast(message, kind);

  if (prefersReducedMotion()) return;
  if (!document.body) return;

  const layer = document.createElement("div");
  layer.className = "confetti-layer";
  layer.setAttribute("aria-hidden", "true");
  const count = 18;
  let pieces = "";
  for (let i = 0; i < count; i++) {
    const spread = ((i / (count - 1)) * 2 - 1) * 42; // -42vw … 42vw
    const drift = (i % 2 === 0 ? 1 : -1) * (10 + (i % 5) * 8);
    const delay = (i % 6) * 55;
    const duration = 900 + (i % 5) * 130;
    const spin = 240 + (i % 7) * 120;
    const colour = CONFETTI_COLOURS[i % CONFETTI_COLOURS.length];
    pieces += `<span style="--x:${spread.toFixed(2)}vw;--drift:${drift}px;--delay:${delay}ms;--dur:${duration}ms;--spin:${spin}deg;--c:${colour}"></span>`;
  }
  layer.innerHTML = pieces;
  document.body.appendChild(layer);
  setTimeout(() => layer.remove(), 1900);
}

/**
 * Start watching. Call once after the first render so the boot snapshot can
 * never be mistaken for a new achievement.
 */
export function initDelight() {
  snapshot = readSnapshot();
  // A sign-in can hydrate a whole history in one emit. Ignore that first beat
  // so returning students are never greeted with confetti they did not earn now.
  armedAt = Date.now() + 2500;

  const markInteracted = () => document.documentElement.classList.add("has-interacted");
  document.addEventListener("pointerdown", markInteracted, { once: true, passive: true });
  document.addEventListener("keydown", markInteracted, { once: true });

  store.subscribe(() => {
    const next = readSnapshot();
    if (!next) return;
    const prev = snapshot;
    snapshot = next;
    if (!prev) return;
    if (Date.now() < armedAt) return;

    const fresh = next.achievementList.filter((a) => a.reached && !prev.achievements.has(a.key));
    const levelledUp = next.level > prev.level;
    if (!fresh.length && !levelledUp) return;

    // One moment at a time: a badge is more specific than a level.
    const now = Date.now();
    if (now - lastCelebration < 3500) return;
    lastCelebration = now;

    if (fresh.length) {
      const a = fresh[0];
      celebrate({
        title: a.title,
        text: fresh.length > 1 ? `${a.description} (+${fresh.length - 1} more badge${fresh.length > 2 ? "s" : ""})` : a.description,
        icon: a.icon,
      });
    } else {
      celebrate({
        title: `Level ${next.level}`,
        text: store.derived?.gamification?.level?.title || "New level unlocked",
        icon: "✦",
      });
    }
  });
}

/** Reset the baseline without celebrating (used when the account changes). */
export function resetDelight() {
  snapshot = readSnapshot();
  armedAt = Date.now() + 2500;
  lastCelebration = 0;
}
