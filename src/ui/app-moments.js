/**
 * app-moments.js — Chotu's contextual reactions.
 *
 * A small, deliberately quiet companion layer: after a *meaningful* action the
 * mascot slides in for a few seconds with one short line, then leaves on its
 * own. It is never a modal, never blocks a click outside its own close button,
 * and never repeats the same line twice in a row.
 *
 * Rules that keep it from becoming noise:
 *   · only a curated set of actions trigger it (see ACTION_MOODS);
 *   · a global cool-down plus a per-mood cool-down swallow bursts (ticking ten
 *     boxes should not summon ten owls);
 *   · it stays silent while the tab is hidden, while a modal is open, and for
 *     anyone who asked for reduced motion (the line still appears, just without
 *     the slide);
 *   · lines are honest — they react to what happened, and never invent progress.
 *
 * Nothing here reads or writes the store. It is a presentation-only layer.
 */
import { esc } from "./dom.js";
import { mascot } from "./mascot.js";

/* --------------------------------------------------------------- copy ----- */
const LINES = {
  tick: [
    "Ticked. One less thing living in your head.",
    "That's the page getting lighter.",
    "Done and dusted. Next one when you're ready.",
    "Small tick, real progress.",
    "Noted. The checklist is earning its keep.",
  ],
  cheer: [
    "Look at you go. Keep that pencil warm.",
    "That deserves a tiny victory lap.",
    "Big page energy. I'm taking notes.",
    "Momentum spotted. Protecting it with my life.",
    "Now *that* is how you close a loop.",
  ],
  focus: [
    "Locked in. Phone face down, one page only.",
    "Timer's running — I'll keep watch.",
    "One block. Nothing else exists for a bit.",
    "Quiet mode: on. You've got this.",
  ],
  encourage: [
    "Not knowing yet is the whole point. Now you know what to look at.",
    "Missed it — that's a map, not a verdict.",
    "Good. Honest answers beat lucky guesses.",
    "Note it, review it, come back stronger.",
    "That one's queued for a second look.",
  ],
  curious: [
    "Ooh, what are we looking for?",
    "Ask me anything — or just poke around.",
    "Nothing here yet. Suspicious. Let's fill it.",
  ],
  oops: [
    "That one slipped through. No drama.",
    "Hmm. Let's try that again in a minute.",
    "Not saved. Your work is safe, promise.",
  ],
  proud: [
    "Recorded. The ladder just got a rung stronger.",
    "Revision logged. Future-you says thanks.",
    "That's how chapters stay learned.",
  ],
  welcome: [
    "New notebook, fresh start. Let's make it count.",
    "Right then. One subject, one page, one tick at a time.",
    "I'm Chotu. I'll be here, quietly judging your streak.",
  ],
  milestone: [
    "That's a milestone. I'm doing the little dance.",
    "Badge earned. Wear it loudly.",
  ],
};

const MOODS = {
  tick: "cheer",
  cheer: "wow",
  focus: "focused",
  encourage: "oops",
  curious: "curious",
  oops: "oops",
  proud: "cheer",
  welcome: "ready",
  milestone: "wow",
};

/** Actions that are allowed to speak. Everything else stays silent. */
const ACTION_MOODS = {
  "toggle-node": (el) => (el?.checked ? "tick" : null),
  "toggle-chapter": (el) => (el?.checked ? "tick" : null),
  "planner-toggle": (el) => (el?.checked ? "tick" : null),
  "chapter-tick-all": (el) => (el?.dataset?.value === "1" ? "cheer" : null),
  "plan-load": () => "cheer",
  "timer-start": () => "focus",
  "timer-resume": () => "focus",
  "timer-stop": () => "cheer",
  "doubt-toggle": (el) => (/reopen/i.test(el?.textContent || "") ? "cheer" : "curious"),
  "fc-know-it": () => "tick",
  "qc-know-it": () => "tick",
  "fc-need-revision": () => "encourage",
  "qc-did-not-know": () => "encourage",
  "fc-start-session": () => "focus",
  "qc-start-session": () => "focus",
  "onb-finish": () => "welcome",
  "account-retry": () => "curious",
};

/* Cooldowns, in ms. Ticks are frequent, so they wait longest. */
const COOLDOWN = {
  tick: 45000,
  cheer: 16000,
  focus: 30000,
  encourage: 18000,
  curious: 30000,
  oops: 20000,
  proud: 20000,
  welcome: 60000,
  milestone: 20000,
};
const GLOBAL_GAP = 6000;
const VISIBLE_FOR = 4200;

let root = null;
let current = null;
let hideTimer = null;
let lastShownAt = 0;
const lastByMood = Object.create(null);
const lastLine = Object.create(null);

function prefersReducedMotion() {
  if (document.documentElement.dataset.reduceMotion === "true") return true;
  try {
    return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  } catch {
    return false;
  }
}

function ensureRoot() {
  if (root && document.body.contains(root)) return root;
  root = document.createElement("div");
  root.id = "moment-root";
  root.className = "moment-root";
  document.body.appendChild(root);
  return root;
}

function pickLine(mood) {
  const pool = LINES[mood] || LINES.curious;
  if (pool.length === 1) return pool[0];
  let index = Math.floor(Math.random() * pool.length);
  if (pool[index] === lastLine[mood]) index = (index + 1) % pool.length;
  lastLine[mood] = pool[index];
  return pool[index];
}

/**
 * Show one short mascot reaction.
 *
 * @param {"tick"|"cheer"|"focus"|"encourage"|"curious"|"oops"|"proud"|"welcome"|"milestone"} mood
 * @param {{ text?: string, force?: boolean }} [opts]
 * @returns {boolean} whether a moment was shown
 */
export function react(mood, { text = "", force = false } = {}) {
  if (!document.body) return false;
  if (!force) {
    if (document.hidden) return false;
    // A modal owns the screen; do not talk over it.
    if (document.getElementById("modal-root")?.firstElementChild) return false;
    const now = Date.now();
    if (now - lastShownAt < GLOBAL_GAP) return false;
    if (now - (lastByMood[mood] || 0) < (COOLDOWN[mood] || 20000)) return false;
  }

  const line = text || pickLine(mood);
  if (!line) return false;

  const host = ensureRoot();
  if (current) {
    current.remove();
    current = null;
  }
  clearTimeout(hideTimer);

  const reduced = prefersReducedMotion();
  const el = document.createElement("div");
  el.className = `chotu-moment chotu-moment--${esc(mood)}${reduced ? " is-quiet" : ""}`;
  el.innerHTML = `
    <div class="chotu-moment-art">${mascot({ mood: MOODS[mood] || "ready", size: 62 })}</div>
    <div class="chotu-moment-bubble">
      <span class="chotu-moment-name">Chotu</span>
      <p>${esc(line)}</p>
      <button type="button" class="chotu-moment-close" aria-label="Dismiss Chotu's message">✕</button>
    </div>`;

  const dismiss = () => {
    clearTimeout(hideTimer);
    if (!current) return;
    const leaving = current;
    current = null;
    leaving.classList.add("is-leaving");
    setTimeout(() => leaving.remove(), reduced ? 0 : 220);
  };

  el.querySelector(".chotu-moment-close")?.addEventListener("click", dismiss);
  host.appendChild(el);
  current = el;

  lastShownAt = Date.now();
  lastByMood[mood] = lastShownAt;
  hideTimer = setTimeout(dismiss, VISIBLE_FOR);
  return true;
}

/**
 * Called once per dispatched action by the event layer. Unknown or noisy
 * actions resolve to `null` and stay completely silent.
 *
 * @param {string} name  the `data-act` name
 * @param {Element} [el] the element that triggered it
 */
export function afterAction(name, el) {
  const rule = ACTION_MOODS[name];
  if (!rule) return;
  let mood = null;
  try { mood = rule(el); } catch { mood = null; }
  if (mood) react(mood);
}

/** Tear down any visible moment (used when the account changes). */
export function resetMoments() {
  clearTimeout(hideTimer);
  if (current) current.remove();
  current = null;
  lastShownAt = 0;
  for (const key of Object.keys(lastByMood)) delete lastByMood[key];
}
