/**
 * app-events.js — DOM event delegation and action dispatch.
 *
 * Sets up click, change, input, submit, keydown, mouseover/mouseout listeners
 * and the runAction dispatcher. All UI interactions flow through data-act
 * attributes handled here.
 */
import { ACTIONS, handleFormSubmit } from "./actions.js?v=mwz7i9p1";
import { toast } from "./app-toasts.js?v=mwz7i9p1";
import { afterAction } from "./app-moments.js?v=mwz7i9p1";
import { closeModal, submitModal } from "./app-modals.js?v=mwz7i9p1";
import { ui, shell } from "./app-state.js?v=mwz7i9p1";
import { renderRoute } from "../app.js?v=mwz7i9p1";

const isControl = (el) => ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable;

/** Close the mobile navigation drawer and keep its toggle's ARIA state honest. */
function closeMobileNav() {
  document.body.classList.remove("nav-open");
  document.querySelector('[data-act="sidebar-toggle"]')?.setAttribute("aria-expanded", "false");
}

/**
 * Dispatch a data-act action. Looks up the handler in ACTIONS and invokes it.
 */
export async function runAction(el, ev) {
  const name = el.dataset.act;
  const fn = ACTIONS[name];
  if (!fn) { console.warn(`[padhle] unknown action “${name}”`); return; }
  try {
    await fn(el, shell.ctx, ev);
    afterAction(name, el);
  } catch (err) {
    console.error(`[padhle] action “${name}” failed`, err);
    toast(err?.message || `Could not complete “${name}”.`, "err");
  }
}

export function initEvents() {
  /* --------------------------------------------------------- click ---- */
  document.addEventListener("click", (e) => {
    // modal chrome first
    const closeBtn = e.target.closest?.("[data-modal-close]");
    if (closeBtn && document.getElementById("modal-root")?.contains(closeBtn)) { closeModal(); return; }
    const submitBtn = e.target.closest?.("[data-modal-submit]");
    if (submitBtn) { submitModal(); return; }
    const backdrop = e.target.closest?.("[data-modal-backdrop]");
    if (backdrop && e.target === backdrop) { closeModal(); return; }

    // Avatar popup toggle. The open state lives on the popup as a class so CSS
    // can animate it and the ARIA state can never drift from what is visible.
    const avatarToggle = e.target.closest?.("[data-act='avatar-toggle']");
    const popup = document.getElementById("avatar-popup");
    if (avatarToggle && popup) {
      e.preventDefault();
      const isOpen = !popup.classList.contains("open");
      popup.classList.toggle("open", isOpen);
      avatarToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      document.body.style.overflow = isOpen ? "hidden" : "";
      return;
    }
    if (popup && popup.classList.contains("open") && !e.target.closest("#avatar-popup")) {
      popup.classList.remove("open");
      document.querySelector("[data-act='avatar-toggle']")?.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }

    const el = e.target.closest?.("[data-act]");
    if (!el) return;
    if (isControl(el)) return; // handled by the change listener, once
    void runAction(el, e);
  });

  /* --------------------------------------------------------- change --- */
  document.addEventListener("change", (e) => {
    const el = e.target.closest?.("[data-act]");
    if (!el) return;
    if (el.tagName === "BUTTON") return; // buttons use click
    if (!isControl(el)) return;
    void runAction(el, e);
  });

  // Onboarding subject picker: keep the selected-count honest without a per-view
  // mount hook (the tour is rendered outside #main). Crucially, never disable a
  // card — the old limit logic disabled every unchecked box once the minimum was
  // reached, which trapped students so they could not add subjects back.
  document.addEventListener("change", (e) => {
    const box = e.target.closest?.('input[name="subjects"]');
    const form = box?.closest?.('[data-form="onboarding-subjects"]');
    if (!form) return;
    const boxes = [...form.querySelectorAll('input[name="subjects"]')];
    const count = boxes.filter((b) => b.checked).length;
    const label = form.querySelector("[data-onb-count]");
    if (label) label.textContent = String(count);
    const error = form.querySelector("[data-form-error]");
    if (error && count > 0) error.textContent = "";
  });

  // Live filtering: a `[data-act="filter-input"]` box writes its value into the UI
  // state on every keystroke and re-renders on a short debounce (focus and caret are
  // restored afterwards). Without this a search box would only narrow the list on
  // blur, which reads as "the filter is broken".
  let pendingFilterRender = null;
  document.addEventListener("input", (e) => {
    const el = e.target.closest?.('[data-act="filter-input"]');
    if (!el) return;
    if (shell.ctx) shell.ctx.ui[el.dataset.filter] = el.value;
    clearTimeout(pendingFilterRender);
    pendingFilterRender = setTimeout(() => renderRoute("filter"), 180);
  });

  /* --------------------------------------------------------- submit --- */
  document.addEventListener("submit", (e) => {
    const form = e.target.closest?.("form[data-form]");
    if (!form) return;
    e.preventDefault();
    if (form.dataset.form === "modal") { void submitModal(); return; }
    const btn = form.querySelector('button[type="submit"]');
    const label = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = "Working…"; }
    Promise.resolve(handleFormSubmit(form, shell.ctx))
      .catch((err) => {
        console.error("[padhle] form submit", err);
        toast(err?.message || "That did not work.", "err");
      })
      .finally(() => { if (btn && document.contains(btn)) { btn.disabled = false; btn.textContent = label; } });
  });

  /* --------------------------------------------------------- keydown -- */
  document.addEventListener("keydown", (e) => {
    const modalOpen = !!document.getElementById("modal-root")?.firstElementChild;
    if (e.key === "Escape") {
      if (modalOpen) { closeModal(); return; }
      const avatarPopup = document.getElementById("avatar-popup");
      if (avatarPopup?.classList.contains("open")) {
        avatarPopup.classList.remove("open");
        document.querySelector("[data-act='avatar-toggle']")?.setAttribute("aria-expanded", "false");
        document.querySelector("[data-act='avatar-toggle']")?.focus?.();
        return;
      }
      if (document.body.classList.contains("nav-open")) { closeMobileNav(); return; }
    }
    if (modalOpen) {
      if (e.key === "Tab") {
        const root = document.getElementById("modal-root");
        const focusables = [...root.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')]
          .filter((el) => !el.disabled && el.offsetParent !== undefined);
        if (focusables.length) {
          const first = focusables[0], last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      return;
    }
    const typing = isControl(document.activeElement);
    if ((e.key === "/" && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) {
      e.preventDefault();
      document.getElementById("global-search")?.focus();
      return;
    }
    // close the mobile drawer when a nav link is followed
    if (e.key === "Enter" && document.activeElement?.closest?.(".nav a")) document.body.classList.remove("nav-open");
  });

  // Dismiss the mobile drawer when the backdrop is tapped or a nav link is
  // followed. The toggle itself is excluded so the very tap that opens the
  // drawer does not bubble here and immediately close it again.
  document.addEventListener("click", (e) => {
    if (!document.body.classList.contains("nav-open")) return;
    if (e.target.closest?.('[data-act="sidebar-toggle"]')) return;
    if (e.target.closest?.(".sidebar .nav a")) { closeMobileNav(); return; }
    if (e.target.closest?.(".sidebar")) return;
    closeMobileNav();
  });

  // chart tooltips
  document.addEventListener("mouseover", (e) => {
    const hit = e.target.closest?.("[data-tip]");
    if (!hit) return;
    const wrap = hit.closest(".chart-wrap");
    const box = wrap?.querySelector("[data-tip-box]");
    if (!box) return;
    box.textContent = hit.dataset.tip || "";
    const wr = wrap.getBoundingClientRect();
    const r = hit.getBoundingClientRect();
    box.style.left = `${Math.round(r.left - wr.left + r.width / 2)}px`;
    box.style.top = `${Math.round(r.top - wr.top)}px`;
    box.classList.add("on");
  });
  document.addEventListener("mouseout", (e) => {
    const hit = e.target.closest?.("[data-tip]");
    if (!hit) return;
    hit.closest(".chart-wrap")?.querySelector("[data-tip-box]")?.classList.remove("on");
  });
}
