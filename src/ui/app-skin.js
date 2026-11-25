/**
 * app-skin.js — Looseleaf boot marker.
 *
 * Looseleaf is the only design; the stylesheet is global and is not gated on
 * any attribute. This module still sets `html[data-skin="looseleaf"]` at boot
 * as a harmless marker for debugging and for integrations that want to detect
 * the active design. There is no classic fallback, no toggle, and no
 * theme-gating.
 */

const ON = "looseleaf";

/** Apply Looseleaf unconditionally. Called at boot. */
function applySkin() {
  return document.documentElement.setAttribute("data-skin", ON);
}

/** Boot-time initialisation. */
export function initSkin() {
  applySkin();
}
