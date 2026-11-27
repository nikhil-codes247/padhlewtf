/**
 * app-focus.js — focus capture and restoration.
 *
 * captureFocus() saves the currently focused element before a re-render;
 * restoreFocus() puts focus back afterward. Uses shared state from
 * app-state.js (viewEl).
 */
import { shell } from "./app-state.js?v=mwz855jx";

export function captureFocus() {
  const el = document.activeElement;
  if (!el || el === document.body || !shell.viewEl?.contains(el)) return null;
  return {
    id: el.id || null,
    act: el.dataset?.act || null,
    filter: el.dataset?.filter || null,
    start: typeof el.selectionStart === "number" ? el.selectionStart : null,
    end: typeof el.selectionEnd === "number" ? el.selectionEnd : null,
  };
}

export function restoreFocus(snap) {
  if (!snap) return;
  let el = null;
  if (snap.id) el = document.getElementById(snap.id);
  if (!el && snap.act) {
    el = shell.viewEl.querySelector(`[data-act="${snap.act}"]${snap.filter ? `[data-filter="${snap.filter}"]` : ""}`);
  }
  if (!el || typeof el.focus !== "function") return;
  try {
    el.focus({ preventScroll: true });
    if (snap.start !== null && typeof el.setSelectionRange === "function") el.setSelectionRange(snap.start, snap.end);
  } catch { /* element not focusable any more */ }
}
