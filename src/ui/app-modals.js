/**
 * app-modals.js — modal dialog system.
 *
 * openModal, closeModal, confirm and submitModal. Uses shared state from
 * app-state.js (ctx) for submitModal callbacks.
 */
import { esc } from "./dom.js?v=mwz6nuk5";
import { shell } from "./app-state.js?v=mwz6nuk5";

let modalSpec = null;
let modalReturnFocus = null;

export function openModal(spec) {
  modalSpec = spec;
  modalReturnFocus = document.activeElement;
  const root = document.getElementById("modal-root");
  root.innerHTML = `    <div class="modal-backdrop" data-modal-backdrop>
      <div class="modal ${spec.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal-head">
          <h2 id="modal-title">${esc(spec.title)}</h2>
          <button type="button" class="btn icon ghost close" data-modal-close aria-label="Close dialog">✕</button>
        </div>
        <div class="modal-body">
          ${spec.body}
          <p class="field-error" data-modal-error role="alert"></p>
        </div>
        ${spec.hideSubmit ? "" : `<div class="modal-foot">
          <button type="button" class="btn" data-modal-close>${esc(spec.cancelLabel || "Cancel")}</button>
          <button type="button" class="btn ${spec.danger ? "danger" : "primary"}" data-modal-submit>${esc(spec.submitLabel || "Save")}</button>
        </div>`}
      </div>
    </div>`;

  const form = root.querySelector("form");
  if (form) {
    form.dataset.form = "modal";
    if (spec.onOpen) { try { spec.onOpen(form); } catch (err) { console.error("[padhle] modal onOpen", err); } }
  }
  if (spec.onOpenNoForm && !form) spec.onOpenNoForm(root);
  const focusTarget = root.querySelector("input[data-confirm-text], input:not([type=hidden]), textarea, select") || root.querySelector("[data-modal-submit]");
  if (focusTarget) { try { focusTarget.focus({ preventScroll: true }); } catch { /* ignore */ } }
  document.body.style.overflow = "hidden";
}

/**
 * Close the open dialog.
 *
 * `expectedSpec` is the dialog the caller believes is on screen. A save runs
 * in the background, so the student can open another dialog while it is still
 * in flight; when the save finally finishes its late close must not wipe that
 * newer dialog (it also erased the new dialog's settings, leaving its buttons
 * dead). Passing the dialog that was saved makes the close precise.
 */
export function closeModal(expectedSpec = null) {
  const root = document.getElementById("modal-root");
  if (!root) return;
  if (expectedSpec && modalSpec && modalSpec !== expectedSpec) return; // a newer dialog is open
  root.innerHTML = "";
  modalSpec = null;
  document.body.style.overflow = "";
  if (modalReturnFocus && document.contains(modalReturnFocus)) {
    try { modalReturnFocus.focus({ preventScroll: true }); } catch { /* ignore */ }
  }
  modalReturnFocus = null;
}

export function confirm(spec) {
  return openModal({
    title: spec.title,
    body: `<p>${spec.body}</p>${spec.requireText ? `<div class="field">
        <label for="confirm-text">Type <b>${esc(spec.requireText)}</b> to confirm</label>
        <input class="input" id="confirm-text" data-confirm-text autocomplete="off" spellcheck="false" placeholder="${esc(spec.requireText)}">
      </div>` : ""}`,
    submitLabel: spec.confirmLabel || "Confirm",
    danger: spec.danger,
    requireText: spec.requireText || null,
    async onSubmit() {
      if (typeof spec.onConfirm === "function") await spec.onConfirm();
    },
  });
}

export async function submitModal() {
  const root = document.getElementById("modal-root");
  if (!root || !modalSpec) return;
  // Remember which dialog this save belongs to: while it is in flight the
  // student may open a different dialog, and only that one may be closed.
  const spec = modalSpec;
  const form = root.querySelector("form");
  const errEl = root.querySelector("[data-modal-error]");
  const btn = root.querySelector("[data-modal-submit]");
  if (errEl) errEl.textContent = "";

  if (form && typeof form.reportValidity === "function" && !form.reportValidity()) {
    if (errEl) errEl.textContent = "Please fill in the required fields.";
    return;
  }
  if (spec.requireText) {
    const input = root.querySelector("[data-confirm-text]");
    if ((input?.value || "").trim() !== spec.requireText) {
      if (errEl) errEl.textContent = `Type ${spec.requireText} exactly to confirm.`;
      return;
    }
  }
  const label = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
  try {
    if (spec.onSubmit) await spec.onSubmit(form, shell.ctx);
    closeModal(spec);
  } catch (err) {
    console.error("[padhle] modal submit", err);
    // Only report on the dialog that failed — a newer one must stay clean.
    if (modalSpec === spec) {
      if (errEl) errEl.textContent = err?.message || "Something went wrong.";
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }
}
