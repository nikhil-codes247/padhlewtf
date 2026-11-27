/**
 * chooseSubjects.js — the subject-selection step (and "manage subjects").
 *
 * One flat grid of all eleven CBSE Class 10 subjects. There is no compulsory /
 * elective split in the product: every subject is optional, and the student
 * decides freely which ones they study. At least one subject is required.
 *
 * The checkboxes are never disabled — a student must always be able to add or
 * remove a subject. The minimum is enforced with a friendly message on submit,
 * not by locking controls (the old limit logic did exactly that and trapped
 * students after their first choice).
 *
 * The choice is saved to the student's own account rows in Supabase.
 */
import { esc } from "../dom.js?v=mwz855jx";
import { subjectMark } from "../components.js?v=mwz855jx";
import { account, isSignedIn } from "../../core/account.js?v=mwz855jx";
import { ALL_SUBJECT_IDS, SUBJECT_MIN } from "../../core/subjects.js?v=mwz855jx";
import { subjectMeta } from "../../core/subjectCatalog.js?v=mwz855jx";
import { currentSelection } from "../selection.js?v=mwz855jx";

/**
 * One subject card.
 *
 * A student's own copy of the catalogue is created in the background after
 * sign-up, so on the subject screen it can still be empty — and the grid would
 * render with nothing in it. The built-in catalogue (the same one the welcome
 * page uses) fills that gap; the student's own copy always wins when it is
 * there, so a renamed or recoloured subject is never overwritten.
 */
function subjectCard(store, id, { checked = false } = {}) {
  const s = store.subject(id) || subjectMeta(id);
  if (!s) return "";
  const meta = [s.code ? `Code ${s.code}` : "", s.short && s.short !== s.name ? s.short : ""].filter(Boolean).join(" · ");
  return `<label class="subject-pick">
    <input type="checkbox" name="subjects" value="${esc(id)}"${checked ? " checked" : ""}>
    <span class="subject-pick-mark">${subjectMark(s)}</span>
    <span class="subject-pick-body">
      <b>${esc(s.name)}</b>
      <span class="small muted">${esc(meta)}</span>
    </span>
    <span class="subject-pick-check" aria-hidden="true">✓</span>
  </label>`;
}

export default {
  id: "choose-subjects",
  title: "Choose subjects",
  render(ctx) {
    const { store } = ctx;
    const selection = currentSelection(store);
    const editing = Boolean(selection);
    const signedIn = isSignedIn();
    const savedSubjects = selection
      ? (selection.subjects || [...(selection.core || []), ...(selection.optional || [])])
      : ALL_SUBJECT_IDS.slice(0, 5);
    const chosen = new Set(ctx.ui.subjectDraft?.subjects ?? savedSubjects);

    const cards = ALL_SUBJECT_IDS.map((id) => subjectCard(store, id, { checked: chosen.has(id) })).join("");
    const count = chosen.size;
    // Settings is the hub for both account and local installs now that the
    // sidebar has no separate Account item.
    const back = "#/settings";

    return `<div class="setup-wrap setup-wide">
      <section class="card setup-card">
        <div class="setup-head">
          <span class="eyebrow">${editing ? "Manage subjects" : signedIn ? "Step 2 of 2 · Your subjects" : "Your subjects"}</span>
          <h1>${editing ? "Your subjects." : "What are you studying?"}</h1>
          <p class="muted">Pick any subjects you want from the eleven below. There are no compulsory or elective groups — your dashboard, syllabus, planner and progress will show exactly what you choose.</p>
        </div>

        <form class="setup-form" data-form="padhle-subjects" novalidate>
          <div class="setup-subject-head">
            <div>
              <h2>Choose your subjects</h2>
              <p class="small muted">Tap a card to add or remove it. You can change this any time from Settings.</p>
            </div>
            <span class="setup-count-pill"><b data-subject-count>${count}</b> / ${ALL_SUBJECT_IDS.length} selected</span>
          </div>

          <div class="subject-pick-grid">${cards}</div>
          <p class="small faint">Mathematics (Basic) replaces Mathematics (Standard) when both would appear on your dashboard.</p>

          <p class="field-error" data-form-error role="alert"></p>
          <div class="setup-actions">
            <button class="btn primary" type="submit">${editing ? "Save subjects" : "Save and open my dashboard"} <span aria-hidden="true">→</span></button>
            ${editing ? `<a class="btn ghost" href="${back}" data-role="subjects-cancel">Cancel</a>` : ""}
          </div>
          <p class="xs faint">Choose at least ${SUBJECT_MIN} subject to continue.</p>
        </form>
      </section>

      <aside class="setup-side" aria-label="Setup progress">
        <div class="setup-progress">
          <div class="setup-progress-head">
            <span class="eyebrow">${editing ? "Subjects" : "Setting up"}</span>
            <span class="small muted">${editing ? "Saved choice" : signedIn ? "2 of 2" : "1 of 1"}</span>
          </div>
          <ol class="setup-steps">
            <li class="on done"><span class="setup-step-dot">✓</span><div><b>Your profile</b><span class="small muted">@${esc(account.profile?.username || "you")}</span></div></li>
            <li class="on"><span class="setup-step-dot">${signedIn ? "2" : "1"}</span><div><b>Your subjects</b><span class="small muted">Pick any of the eleven</span></div></li>
          </ol>
          <p class="small muted">Your dashboard is built from this list. Unselected subjects stay out of the way.</p>
        </div>
        <div class="setup-note">
          <span class="eyebrow">Totally your call</span>
          <b>Any subject, any combination.</b>
          <span class="small muted">Choose one or choose all eleven — each one comes with its full chapter and topic checklist.</span>
        </div>
      </aside>
    </div>`;
  },

  mount(ctx) {
    const form = document.querySelector('[data-form="padhle-subjects"]');
    if (!form) return;
    const boxes = [...form.querySelectorAll('input[name="subjects"]')];
    const countEl = form.querySelector("[data-subject-count]");
    const remember = () => {
      ctx.ui.subjectDraft = { subjects: boxes.filter((b) => b.checked).map((b) => b.value) };
    };
    const update = () => {
      const count = boxes.filter((b) => b.checked).length;
      if (countEl) countEl.textContent = String(count);
      // Never disable a box: selection must stay fully reversible.
    };
    const onChange = () => { remember(); update(); };
    form.addEventListener("change", onChange);
    // Cancelling throws away the unsaved draft so the next visit starts from
    // the saved selection, not from half-finished edits.
    const cancel = form.querySelector('[data-role="subjects-cancel"]');
    const onCancel = () => { ctx.ui.subjectDraft = null; };
    cancel?.addEventListener("click", onCancel);
    update();
    return () => {
      form.removeEventListener("change", onChange);
      cancel?.removeEventListener("click", onCancel);
    };
  },
};
