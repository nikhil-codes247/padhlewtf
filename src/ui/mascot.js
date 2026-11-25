/**
 * mascot.js — the PADHLE.WTF study buddy ("Chotu", the owl).
 *
 * A tiny, dependency-free inline SVG drawn in the Looseleaf grammar: pencil
 * strokes, sticky-note fills and a slightly wonky silhouette. Every colour is
 * either a semantic token or the fixed sticky-note ink, so the owl reads the
 * same in light and dark mode (sticky notes stay physical objects at night).
 *
 * The mark is decorative by default. Pass `label` when it carries meaning and
 * it becomes an accessible image instead of being hidden from screen readers.
 */

const FACE_INK = "#2a2420"; // sticky notes are bright in both themes → dark ink

/** Expression paths. Kept as small strings so moods stay cheap to render. */
const EYES = {
  ready: {
    open: `
      <circle cx="49" cy="49" r="12" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.2"/>
      <circle cx="71" cy="49" r="12" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.2"/>
      <circle cx="51" cy="51" r="5.2" fill="${FACE_INK}"/>
      <circle cx="69" cy="51" r="5.2" fill="${FACE_INK}"/>
      <circle cx="52.6" cy="48.6" r="1.6" fill="#fffdf6"/>
      <circle cx="70.6" cy="48.6" r="1.6" fill="#fffdf6"/>`,
    brow: "",
  },
  focused: {
    open: `
      <circle cx="49" cy="49" r="12" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.2"/>
      <circle cx="71" cy="49" r="12" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.2"/>
      <circle cx="52" cy="50" r="5.6" fill="${FACE_INK}"/>
      <circle cx="68" cy="50" r="5.6" fill="${FACE_INK}"/>
      <circle cx="53.6" cy="47.6" r="1.5" fill="#fffdf6"/>`,
    brow: `
      <path d="M39 36c4-3 9-4 14-2" fill="none" stroke="${FACE_INK}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M67 34c5-2 10-1 14 2" fill="none" stroke="${FACE_INK}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  cheer: {
    open: `
      <path d="M40 46l4 7 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1z" fill="var(--ll-hi, #f8dc4c)" stroke="${FACE_INK}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M80 46l4 7 8 1-6 6 2 8-8-4-8 4 2-8-6-6 8-1z" fill="var(--ll-hi, #f8dc4c)" stroke="${FACE_INK}" stroke-width="1.8" stroke-linejoin="round"/>`,
    brow: "",
  },
  sleepy: {
    open: `
      <path d="M38 50c4 4 9 4 13 0" fill="none" stroke="${FACE_INK}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M69 50c4 4 9 4 13 0" fill="none" stroke="${FACE_INK}" stroke-width="2.6" stroke-linecap="round"/>`,
    brow: "",
  },
  /* Wide-eyed and leaning in — used for searches, empty states and first looks. */
  curious: {
    open: `
      <circle cx="49" cy="49" r="12.5" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.2"/>
      <circle cx="71" cy="49" r="12.5" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.2"/>
      <circle cx="54" cy="50" r="5" fill="${FACE_INK}"/>
      <circle cx="68" cy="50" r="5" fill="${FACE_INK}"/>
      <circle cx="55.4" cy="48" r="1.7" fill="#fffdf6"/>
      <circle cx="69.4" cy="48" r="1.7" fill="#fffdf6"/>`,
    brow: `
      <path d="M37 33c4-4 9-5 14-2.5" fill="none" stroke="${FACE_INK}" stroke-width="2.3" stroke-linecap="round"/>
      <path d="M68 29c5-1.5 10 0 14 4" fill="none" stroke="${FACE_INK}" stroke-width="2.3" stroke-linecap="round"/>`,
  },
  /* Sparkly-eyed delight — reserved for small wins, not every click. */
  wow: {
    open: `
      <path d="M42 41l2.6 5.2 5.8.8-4.2 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.2-4 5.8-.8z" fill="var(--ll-hi, #f8dc4c)" stroke="${FACE_INK}" stroke-width="1.7" stroke-linejoin="round"/>
      <path d="M78 41l2.6 5.2 5.8.8-4.2 4 1 5.7-5.2-2.7-5.2 2.7 1-5.7-4.2-4 5.8-.8z" fill="var(--ll-hi, #f8dc4c)" stroke="${FACE_INK}" stroke-width="1.7" stroke-linejoin="round"/>
      <circle cx="49" cy="49" r="3.2" fill="${FACE_INK}"/>
      <circle cx="71" cy="49" r="3.2" fill="${FACE_INK}"/>`,
    brow: `
      <path d="M38 32c4-3 9-3 13 0" fill="none" stroke="${FACE_INK}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M69 32c4-3 9-3 13 0" fill="none" stroke="${FACE_INK}" stroke-width="2.2" stroke-linecap="round"/>`,
  },
  /* Gentle, never shaming — a missed answer is information, not failure. */
  oops: {
    open: `
      <circle cx="49" cy="50" r="11.5" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.1"/>
      <circle cx="71" cy="50" r="11.5" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="2.1"/>
      <circle cx="50" cy="53" r="4.6" fill="${FACE_INK}"/>
      <circle cx="70" cy="53" r="4.6" fill="${FACE_INK}"/>`,
    brow: `
      <path d="M40 38c4 2 8 3 12 2" fill="none" stroke="${FACE_INK}" stroke-width="2.3" stroke-linecap="round"/>
      <path d="M68 40c4 1 8 0 12-2" fill="none" stroke="${FACE_INK}" stroke-width="2.3" stroke-linecap="round"/>`,
  },
};

/**
 * @param {object} [opts]
 * @param {"ready"|"focused"|"cheer"|"sleepy"|"curious"|"wow"|"oops"} [opts.mood]
 * @param {number} [opts.size]  rendered square size in px
 * @param {string} [opts.className]
 * @param {string} [opts.label] accessible name (omit for decorative use)
 */
export function mascot({ mood = "ready", size = 96, className = "", label = "" } = {}) {
  const face = EYES[mood] || EYES.ready;
  const a11y = label
    ? `role="img" aria-label="${escapeAttr(label)}"`
    : 'aria-hidden="true" focusable="false"';

  return `<svg class="mascot ${className}" width="${Number(size) || 96}" height="${Number(size) || 96}"
    viewBox="0 0 120 120" ${a11y}>
    <g class="mascot-body">
      <!-- pencil tucked behind the right wing -->
      <g class="mascot-pencil" transform="rotate(24 92 60)">
        <rect x="88" y="30" width="9" height="34" rx="2" fill="var(--ll-sticky-yellow, #f7e38a)" stroke="${FACE_INK}" stroke-width="1.6"/>
        <path d="M88 64h9l-4.5 9z" fill="var(--ll-kraft, #dcc8a3)" stroke="${FACE_INK}" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M92.5 73l-1.7 4 3.4-1z" fill="${FACE_INK}"/>
        <rect x="88" y="30" width="9" height="5" rx="1" fill="var(--ll-sticky-pink, #f6b8b0)" stroke="${FACE_INK}" stroke-width="1.4"/>
      </g>

      <!-- ear tufts -->
      <path d="M35 31c-2-8 2-13 8-15-1 5 1 9 5 11" fill="var(--ll-sticky-orange, #f7c08e)" stroke="${FACE_INK}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M85 31c2-8-2-13-8-15 1 5-1 9-5 11" fill="var(--ll-sticky-orange, #f7c08e)" stroke="${FACE_INK}" stroke-width="2.2" stroke-linejoin="round"/>

      <!-- head + body silhouette -->
      <path d="M60 20c-23 0-37 15-37 38 0 27 16 47 37 47s37-20 37-47c0-23-14-38-37-38Z"
        fill="var(--ll-sticky-orange, #f7c08e)" stroke="${FACE_INK}" stroke-width="2.4"/>

      <!-- wings -->
      <path d="M26 54c-6 9-5 22 2 28 3-7 4-15 3-25" fill="var(--ll-sticky-yellow, #f7e38a)" stroke="${FACE_INK}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M94 54c6 9 5 22-2 28-3-7-4-15-3-25" fill="var(--ll-sticky-yellow, #f7e38a)" stroke="${FACE_INK}" stroke-width="2.2" stroke-linejoin="round"/>

      <!-- belly -->
      <ellipse cx="60" cy="79" rx="19" ry="22" fill="var(--ll-photo, #fffdf6)" stroke="${FACE_INK}" stroke-width="1.8"/>
      <path d="M53 72c2 8 2 15 0 22M60 70v25M67 72c-2 8-2 15 0 22"
        fill="none" stroke="${FACE_INK}" stroke-width="1.2" opacity="0.32" stroke-linecap="round"/>

      ${face.open}
      ${face.brow}

      <!-- beak -->
      <path d="M54 60c2-2 10-2 12 0-1.6 5-4 7-6 7s-4.4-2-6-7Z" fill="var(--ll-marker, #df6b3c)" stroke="${FACE_INK}" stroke-width="1.8" stroke-linejoin="round"/>

      <!-- feet -->
      <path d="M45 104c-4 0-6 2-6 4h12c0-2-2-4-6-4Zm30 0c-4 0-6 2-6 4h12c0-2-2-4-6-4Z"
        fill="var(--ll-sticky-yellow, #f7e38a)" stroke="${FACE_INK}" stroke-width="1.8" stroke-linejoin="round"/>
    </g>
  </svg>`;
}

/** A mascot plus a hand-written speech bubble. */
export function mascotBubble({ mood = "ready", size = 92, title = "", text = "", className = "" } = {}) {
  return `<div class="buddy ${className}">
    <div class="buddy-art">${mascot({ mood, size })}</div>
    <div class="buddy-bubble">
      ${title ? `<b class="buddy-title">${escapeHtml(title)}</b>` : ""}
      <p class="buddy-text">${escapeHtml(text)}</p>
    </div>
  </div>`;
}

function escapeHtml(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function escapeAttr(v) {
  return escapeHtml(v).replace(/\n/g, " ");
}
