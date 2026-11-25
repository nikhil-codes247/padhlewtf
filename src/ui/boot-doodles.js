/**
 * boot-doodles.js — the hand-drawn study objects that float around the boot
 * card.
 *
 * The artwork lives once in index.html as a hidden SVG symbol sprite so the
 * very first paint can show it before any JavaScript runs. This module only
 * emits the positioned wrappers; both the static boot card and the account
 * gate therefore share exactly the same scene and class hooks.
 *
 * Symbols are decorative: every wrapper is aria-hidden and pointer-events are
 * removed in CSS.
 */

const DOODLES = [
  "book",
  "pencil",
  "notebook",
  "sticky",
  "ruler",
  "clip",
  "calc",
  "bulb",
  "books",
];

export function bootDoodles() {
  return `<div class="boot-doodles" aria-hidden="true">${DOODLES.map((name) => `<span class="boot-doodle doodle-${name}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#doodle-${name}"></use></svg></span>`).join("")}</div>`;
}
