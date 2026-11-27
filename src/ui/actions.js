/**
 * actions.js — every state-changing interaction in one place.
 * Views declare intent with `data-act`; this module owns the behaviour, so the
 * views stay declarative and there is exactly one code path per action.
 */
import { esc, option } from "./dom.js?v=mwz6nuk5";
import { store } from "../core/store.js?v=mwz6nuk5";
import { exportBundle, validateBundle, downloadJson, downloadCsv, readJsonFile } from "../core/exportimport.js?v=mwz6nuk5";
import { todayISO, fmtShort, fmtDuration } from "../core/dates.js?v=mwz6nuk5";
import { PRIORITIES, ACTIVITIES } from "../core/validate.js?v=mwz6nuk5";
import { isNative } from "../core/native.js?v=mwz6nuk5";
import {
  syncTimerAlarm, syncDailyReminder, clearTimerEndAlarm,
  requestReminderPermission, sendTestReminder,
} from "../core/reminders.js?v=mwz6nuk5";
import { buildShareCard, shareCardKinds } from "../core/shareCard.js?v=mwz6nuk5";
import { renderCardPng, renderCardGif } from "./shareRender.js?v=mwz6nuk5";
import { onboardingSteps, readProfileStep } from "./onboarding.js?v=mwz6nuk5";
import { startCheckout } from "./checkout.js?v=mwz6nuk5";
import {
  signUpAccount, signInAccount, signInWithGoogleOAuth, signOutAccount, createProfile,
  hasProfile, initAccount, setPendingEmail, clearPendingEmail,
  validateUsername, checkUsernameAvailability, resetAccountData, deleteAccount,
  isSignedIn, account, resetPassword,
} from "../core/account.js?v=mwz6nuk5";
import { validateSubjectChoice, CORE_SUBJECT_IDS } from "../core/subjects.js?v=mwz6nuk5";
import { currentSelection, saveSelection } from "./selection.js?v=mwz6nuk5";

/** Write a form-level error where the view provided a slot for it. */
function formError(form, message) {
  const el = form?.querySelector?.("[data-form-error]");
  if (el) el.textContent = message || "";
}

/** The share-card model currently selected in the studio, or null. */
function currentShareModel(ctx) {
  const g = store.derived.gamification;
  const kinds = shareCardKinds(g.shareFacts);
  const kind = kinds.includes(ctx.ui.shareKind) ? ctx.ui.shareKind : kinds[0];
  if (!kind) return null;
  ctx.ui.shareKind = kind;
  return buildShareCard(g.shareFacts, kind);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Busy-button helper: swap the label while an async render runs. */
async function withBusy(el, label, fn) {
  const prev = el?.textContent;
  if (el) { el.disabled = true; el.textContent = label; }
  try { return await fn(); }
  finally { if (el) { el.disabled = false; el.textContent = prev; } }
}

/* --------------------------------------------------------------- helpers -- */
const q = (id) => document.getElementById(id);
const val = (form, name) => form.elements[name]?.value ?? "";

/* ------------------------------------------------------------------ modals -- */
export function subjectModal(existing = null) {
  return {
    title: existing ? `Edit “${existing.name}”` : "New subject",
    submitLabel: existing ? "Save subject" : "Create subject",
    body: `<form data-form="modal" class="stack">
      ${field("name", "Subject name", existing?.name ?? "", { required: true, placeholder: "e.g. Mathematics" })}
      <div class="grid-2">
        ${field("code", "Board code", existing?.code ?? "", { placeholder: "e.g. 041" })}
        ${field("short", "Short label", existing?.short ?? "", { placeholder: "used on chips" })}
      </div>
      <div class="grid-2">
        ${field("color", "Colour", existing?.color ?? "#5b3df5", { type: "color" })}
        ${field("totalMarks", "Total marks", existing?.totalMarks ?? 80, { type: "number", min: 0, max: 200 })}
      </div>
      ${field("deadline", "Subject deadline (optional)", existing?.deadline ?? "", { type: "date" })}
      ${field("tags", "Tags", (existing?.tags || []).join(", "), { placeholder: "comma separated" })}
      ${textarea("notes", "Notes", existing?.notes ?? "")}
    </form>`,
    async onSubmit(form, ctx) {
      const data = readForm(form);
      if (existing) await store.updateSubject(existing.id, data);
      else await store.addSubject(data);
      ctx.toast(existing ? "Subject updated." : "Subject created.", "ok");
    },
  };
}

export function chapterModal(existing) {
  return {
    title: `Edit “${existing.name}”`,
    wide: true,
    submitLabel: "Save chapter",
    body: `<form data-form="modal" class="stack">
      ${field("unit", "Unit / theme", existing?.unit ?? "", { placeholder: "e.g. Unit I Number Systems" })}
      <div class="grid-3">
        ${select("scope", "Tracking scope", [["board", "Board-assessed"], ["internal", "Internal / school only"], ["optional", "Optional / excluded"]], existing?.scope ?? "board", "Optional and internal work is tracked but never counted as unfinished board work.")}
        ${select("priority", "Priority", PRIORITIES.map((p) => [p, p]), existing?.priority ?? "P2")}
        ${select("globalTier", "Global tier", [["1", "1 — drill to mastery"], ["2", "2 — learn + schedule revision"], ["3", "3 — light touch"]], String(existing?.globalTier ?? "2"))}
      </div>
      <div class="grid-3">
        ${select("difficulty", "Difficulty", [["D1", "D1 easiest"], ["D2", "D2"], ["D3", "D3"], ["D4", "D4 hardest"]], existing?.difficulty ?? "D2")}
        ${field("marksLabel", "Marks (free text)", existing?.marksLabel ?? "", { placeholder: "e.g. Unit I = 06" })}
        ${field("estMin", "Estimated minutes", existing?.estMin ?? "", { type: "number", min: 0, max: 1440 })}
      </div>
      <div class="grid-2">
        ${field("deadline", "Deadline", existing?.deadline ?? "", { type: "date" })}
        ${field("tags", "Tags", (existing?.tags || []).join(", "), { placeholder: "comma separated" })}
      </div>
      ${field("assessedLabel", "Assessment label", existing?.assessedLabel ?? "", { placeholder: "e.g. board assessed" })}
      ${textarea("ruleNote", "Assessment rule note", existing?.ruleNote ?? "", { rows: 2, hint: "e.g. “Periodic Assessment only” — shown as a warning on the chapter." })}
      ${field("nextAction", "Suggested next action", existing?.nextAction ?? "")}
      ${textarea("notes", "Your note about this chapter", existing?.notes ?? "")}
    </form>`,
    async onSubmit(form, ctx) {
      const data = readForm(form);
      await store.updateChapter(existing.id, data);
      ctx.toast("Chapter updated.", "ok");
    },
  };
}

export function nodeModal(existing) {
  return {
    title: `Edit “${existing.name}”`,
    submitLabel: "Save item",
    body: `<form data-form="modal" class="stack">
      ${field("name", "Name", existing?.name ?? "", { required: true, placeholder: "e.g. HCF & LCM word problems" })}
      <div class="grid-3">
        ${select("kind", "Type", [["topic", "Topic"], ["subtopic", "Sub-topic"], ["task", "Checklist item"]], existing?.kind ?? "task")}
        ${field("estMin", "Estimated minutes", existing?.estMin ?? "", { type: "number", min: 0, max: 1440 })}
        ${select("priority", "Priority", PRIORITIES.map((p) => [p, p]), existing?.priority ?? "P2")}
      </div>
      <div class="grid-2">
        ${field("deadline", "Deadline", existing?.deadline ?? "", { type: "date" })}
        ${field("tags", "Tags", (existing?.tags || []).join(", "), { placeholder: "comma separated" })}
      </div>
      ${textarea("notes", "Notes", existing?.notes ?? "", { rows: 2 })}
    </form>`,
    async onSubmit(form, ctx) {
      const data = readForm(form);
      await store.updateNode(existing.id, data);
      ctx.toast("Item updated.", "ok");
    },
  };
}

export function sessionModal({ chapterId = null, nodeId = null, existing = null } = {}) {
  const ch = existing?.chapterId || chapterId;
  const chapter = ch ? store.chapter(ch) : null;
  return {
    title: existing ? "Edit study session" : "Log study time",
    submitLabel: existing ? "Save session" : "Log session",
    body: `<form data-form="modal" class="stack">
      <div class="grid-2">
        ${field("dateISO", "Date", existing?.dateISO ?? todayISO(), { type: "date", required: true })}
        ${field("minutes", "Minutes", existing?.minutes ?? "", { type: "number", min: 1, max: 1440, required: true })}
      </div>
      <div class="grid-2">
        ${select("subjectId", "Subject", [["", "— none —"], ...store.subjectsSorted().map((s) => [s.id, s.name])], existing?.subjectId ?? chapter?.subjectId ?? "")}
        ${select("chapterId", "Chapter", [["", "— none —"]], existing?.chapterId ?? chapterId ?? "", "Chapters are filtered by subject once you pick one.", true)}
      </div>
      <div class="grid-2">
        ${select("nodeId", "Topic (optional)", [["", "— whole chapter —"]], existing?.nodeId ?? nodeId ?? "", "", true)}
        ${select("activity", "Activity", ACTIVITIES.map((a) => [a.id, a.label]), existing?.activity ?? "learn")}
      </div>
      ${textarea("notes", "What did you do?", existing?.notes ?? "", { rows: 2, placeholder: "e.g. 15 NCERT questions, 3 wrong" })}
      ${field("outcome", "Outcome (optional)", existing?.outcome ?? "", { placeholder: "e.g. chapter practice finished" })}
    </form>`,
    onOpen(form) { wireChapterSelects(form); },
    async onSubmit(form, ctx) {
      const data = readForm(form);
      if (existing) await store.updateSession(existing.id, data);
      else await store.logSession(data);
      ctx.toast(existing ? "Session updated." : `Logged ${fmtDuration(data.minutes)}.`, "ok");
    },
  };
}

export function revisionModal({ chapterId = null, nodeId = null } = {}) {
  const chapter = chapterId ? store.chapter(chapterId) : null;
  const node = nodeId ? store.node(nodeId) : null;
  const chId = chapterId || node?.chapterId || "";
  const existing = store.state.revisions.filter((r) => (r.targetType === "node" ? r.targetId === nodeId : r.targetId === chId));
  const nextPass = Math.max(0, ...existing.map((r) => Number(r.pass) || 0)) + 1;
  return {
    title: `Record revision${chapter ? ` · ${chapter.name}` : ""}`,
    submitLabel: `Save revision pass R${nextPass}`,
    body: `<form data-form="modal" class="stack">
      <div class="callout info">Completing a revision adds a <b>new</b> record. Your original study sessions and completion ticks are untouched.</div>
      <div class="grid-2">
        ${select("chapterId", "Chapter", [[chId || "", chapter?.name || "—"]], chId, "", false)}
        ${select("nodeId", "Item (optional)", [["", "— chapter level —"], ...(chId ? store.nodesOf(chId).map((n) => [n.id, n.name]) : [])], nodeId || "")}
      </div>
      <div class="grid-3">
        ${field("pass", "Pass number", nextPass, { type: "number", min: 1, max: 20 })}
        ${field("dateISO", "Date", todayISO(), { type: "date", required: true })}
        ${field("score", "Self-score (0–5, optional)", "", { type: "number", min: 0, max: 5 })}
      </div>
      ${textarea("notes", "How did it go?", "", { rows: 3, placeholder: "e.g. second half still shaky; trigonometry identities need a third pass" })}
    </form>`,
    async onSubmit(form, ctx) {
      const data = readForm(form);
      await store.addRevision({
        chapterId: data.chapterId, nodeId: data.nodeId || null, pass: data.pass,
        dateISO: data.dateISO, score: data.score === "" ? null : data.score, notes: data.notes,
      });
      ctx.toast(`Revision R${data.pass} recorded.`, "ok");
    },
  };
}

export function noteModal({ chapterId = null, nodeId = null, kind = "note", existing = null } = {}) {
  const chId = existing?.chapterId || chapterId || "";
  return {
    title: existing ? "Edit entry" : (kind === "doubt" ? "Record a doubt" : kind === "formula" ? "Save a formula" : "New note"),
    submitLabel: existing ? "Save" : "Add",
    body: `<form data-form="modal" class="stack">
      <div class="grid-2">
        ${select("kind", "Type", [["note", "Note"], ["doubt", "Doubt / question"], ["formula", "Formula"], ["reminder", "Reminder"]], existing?.kind ?? kind)}
        ${select("doubtStatus", "Doubt status", [["unresolved", "Unresolved"], ["inprogress", "In progress"], ["resolved", "Resolved"]], existing?.doubtStatus ?? "unresolved", "Only used for doubts.")}
      </div>
      <div class="grid-2">
        ${select("chapterId", "Chapter", [["", "— no chapter —"]], chId, "", true)}
        ${select("nodeId", "Item (optional)", [["", "— chapter level —"]], existing?.nodeId ?? nodeId ?? "", "", true)}
      </div>
      ${textarea("text", "Content", existing?.text ?? "", { rows: 5, required: true, placeholder: "Write it in your own words — future you will thank you." })}
      <label class="check"><input type="checkbox" name="pinned" ${existing?.pinned ? "checked" : ""}><span class="box"></span><span class="label-text small">Pin this</span></label>
    </form>`,
    onOpen(form) { wireChapterSelects(form); },
    async onSubmit(form, ctx) {
      const data = readForm(form);
      data.pinned = !!form.elements.pinned?.checked;
      data.nodeId = data.nodeId || null;
      data.chapterId = data.chapterId || null;
      if (existing) await store.updateNote(existing.id, data);
      else await store.addNote(data);
      ctx.toast(existing ? "Entry updated." : "Entry saved.", "ok");
    },
  };
}

export function tagModal(existing = null) {
  return {
    title: existing ? `Edit tag “${existing.label}”` : "New tag",
    submitLabel: existing ? "Save tag" : "Create tag",
    body: `<form data-form="modal" class="stack">
      ${field("label", "Label", existing?.label ?? "", { required: true, placeholder: "e.g. Ncert-first" })}
      <div class="grid-2">
        ${select("kind", "Kind", [["custom", "Custom tag"], ["status", "Status tag"]], existing?.kind ?? "custom")}
        ${field("color", "Colour", existing?.color ?? "#5b3df5", { type: "color" })}
      </div>
      <div class="field-hint">Renaming a tag updates every chapter and item already using it.</div>
    </form>`,
    async onSubmit(form, ctx) {
      const data = readForm(form);
      if (existing) await store.updateTag(existing.id, data);
      else await store.addTag(data);
      ctx.toast(existing ? "Tag updated." : "Tag created.", "ok");
    },
  };
}

export function plannerModal({ dateISO, existing = null, chapterId = null, title = "", estMin = null } = {}) {
  return {
    title: existing ? "Edit planned task" : "Add a task to this day",
    submitLabel: existing ? "Save task" : "Add to plan",
    body: `<form data-form="modal" class="stack">
      ${field("title", "Task", existing?.title ?? title, { required: true, placeholder: "e.g. Finish Real Numbers PYQs" })}
      <div class="grid-3">
        ${field("dateISO", "Date", existing?.dateISO ?? dateISO, { type: "date", required: true })}
        ${field("estMin", "Minutes", existing?.estMin ?? estMin ?? 45, { type: "number", min: 0, max: 1440 })}
        ${select("priority", "Priority", PRIORITIES.map((p) => [p, p]), existing?.priority ?? "P2")}
      </div>
      <div class="grid-2">
        ${select("subjectId", "Subject", [["", "— none —"], ...store.subjectsSorted().map((s) => [s.id, s.name])], existing?.subjectId ?? ((chapterId ? store.chapter(chapterId)?.subjectId : "") || ""))}
        ${select("chapterId", "Chapter", [["", "— none —"]], existing?.chapterId ?? chapterId ?? "", "", true)}
      </div>
      ${textarea("task", "Detail / instructions", existing?.task ?? "", { rows: 2 })}
      ${field("target", "Target output", existing?.target ?? "", { placeholder: "e.g. 20 MCQs, 90% accuracy" })}
    </form>`,
    onOpen(form) { wireChapterSelects(form); },
    async onSubmit(form, ctx) {
      const data = readForm(form);
      if (existing) await store.updatePlannedTask(existing.id, data);
      else await store.addPlannedTask(data);
      ctx.toast(existing ? "Task updated." : `Added to ${fmtShort(data.dateISO)}.`, "ok");
    },
  };
}

/* ------------------------------------------------------------ form pieces -- */
export function field(name, label, value = "", { type = "text", required = false, placeholder = "", hint = "", min, max, step } = {}) {
  return `<div class="field">
    <label for="f-${esc(name)}">${esc(label)}</label>
    <input class="input" id="f-${esc(name)}" name="${esc(name)}" type="${esc(type)}" value="${esc(value ?? "")}"
      ${required ? "required" : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}
      ${min !== undefined ? `min="${esc(min)}"` : ""} ${max !== undefined ? `max="${esc(max)}"` : ""} ${step !== undefined ? `step="${esc(step)}"` : ""}>
    ${hint ? `<div class="field-hint">${esc(hint)}</div>` : ""}
  </div>`;
}

export function textarea(name, label, value = "", { rows = 4, required = false, placeholder = "", hint = "" } = {}) {
  return `<div class="field">
    <label for="f-${esc(name)}">${esc(label)}</label>
    <textarea class="textarea" id="f-${esc(name)}" name="${esc(name)}" rows="${rows}" ${required ? "required" : ""} ${placeholder ? `placeholder="${esc(placeholder)}"` : ""}>${esc(value ?? "")}</textarea>
    ${hint ? `<div class="field-hint">${esc(hint)}</div>` : ""}
  </div>`;
}

export function select(name, label, options, value, hint = "", dynamicChapter = false) {
  return `<div class="field">
    <label for="f-${esc(name)}">${esc(label)}</label>
    <select class="select" id="f-${esc(name)}" name="${esc(name)}" ${dynamicChapter ? 'data-chapter-select="1"' : ""}>
      ${options.map(([v, l]) => option(v, l, String(v) === String(value))).join("")}
    </select>
    ${hint ? `<div class="field-hint">${esc(hint)}</div>` : ""}
  </div>`;
}

export function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === "checkbox") { out[el.name] = el.checked; continue; }
    out[el.name] = typeof el.value === "string" ? el.value.trim() : el.value;
  }
  return out;
}

/** Keep the chapter select in sync with the chosen subject, and the item select with the chapter. */
export function wireChapterSelects(form) {
  const subjSel = form.elements.subjectId;
  const chSel = form.elements.chapterId;
  const nodeSel = form.elements.nodeId;
  if (!chSel) return;
  const currentCh = chSel.value;
  const currentNode = nodeSel ? nodeSel.value : "";
  // a pre-selected chapter must make its subject visible, otherwise the list rebuilds empty
  if (subjSel && !subjSel.value && currentCh) {
    const c = store.chapter(currentCh);
    if (c) subjSel.value = c.subjectId;
  }
  const fillChapters = (keep) => {
    const sid = subjSel?.value || "";
    const list = sid ? store.chaptersOf(sid) : store.state.chapters;
    chSel.innerHTML = option("", list.length ? "— none —" : "— no chapters —", "") + list.map((c) => option(c.id, c.name, keep)).join("");
  };
  const fillNodes = (keep) => {
    if (!nodeSel) return;
    const cid = chSel.value;
    nodeSel.innerHTML = option("", cid ? "— whole chapter —" : "— pick a chapter first —", "")
      + (cid ? store.nodesOf(cid).map((n) => option(n.id, n.name, keep)).join("") : "");
  };
  if (subjSel) subjSel.addEventListener("change", () => { fillChapters(""); fillNodes(""); });
  chSel.addEventListener("change", () => fillNodes(""));
  fillChapters(currentCh);
  fillNodes(currentNode);
}

/* ----------------------------------------------------------------- actions -- */
export const ACTIONS = {
  /* navigation & chrome */
  "nav-toggle": () => document.body.classList.toggle("nav-open"),

  /* account (Supabase deployments) */
  "auth-signout": async (el, ctx) => {
    await signOutAccount();
    ctx.toast("Signed out.", "info");
    ctx.navigate("#/welcome");
  },
  // Starts the Supabase → Google redirect. This must be a real ACTIONS entry:
  // it is a <button data-act>, not a form submit, so handleFormSubmit never
  // sees it. Without this key the button silently logged "unknown action".
  "padhle-google-signin": async (el, ctx) => {
    await withBusy(el, "Signing in with Google…", async () => {
      try {
        await signInWithGoogleOAuth();
      } catch (err) {
        ctx.toast(err?.message || "Could not sign in with Google.", "err");
      }
    });
  },
  "account-retry": async (el, ctx) => {
    await initAccount({ force: true });
    ctx.rerender();
  },
  "clear-pending-email": (el, ctx) => {
    clearPendingEmail();
    if (el.dataset.next) ctx.navigate(el.dataset.next);
    else ctx.rerender();
  },
  "auth-cancel-forgot": (el, ctx) => {
    ctx.ui.authMode = "login";
    ctx.rerender();
  },
  "auth-forgot": (el, ctx) => {
    ctx.ui.authMode = "forgot";
    ctx.rerender();
  },
  "auth-reset-password": async (el, ctx) => {
    const form = el.closest("form");
    const data = readForm(form);
    formError(form, "");
    try {
      await resetPassword(data.email);
      ctx.toast("Password reset link sent to your email. Check your inbox (and spam).", "ok");
      ctx.ui.authMode = "login";
      ctx.rerender();
    } catch (err) {
      formError(form, err?.message || "Could not send reset link.");
    }
  },
  "auth-cancel-forgot": (el, ctx) => {
    ctx.ui.authMode = "login";
    ctx.rerender();
  },
  /* welcome tour (shown once, for a brand-new install) */
  "onb-next": (el, ctx) => {
    const steps = onboardingSteps();
    const cur = Number(ctx.ui.onbStep) || 0;
    if (cur === 0) {
      const s = store.state.settings;
      const sel = currentSelection(store);
      ctx.ui._onb = {
        displayName: s.displayName && s.displayName !== "Student" ? s.displayName : "",
        avatar: s.avatar || "🦉",
        targetDate: s.targetDate || "",
        dailyTargetMin: s.dailyTargetMin ?? 230,
        subjects: sel
          ? (sel.subjects || [...(sel.core || []), ...(sel.optional || [])])
          : [...CORE_SUBJECT_IDS],
      };
    }
    // Past the last stage, "next" means finish (the unlock stage can be skipped).
    if (cur >= steps.length - 1) return ACTIONS["onb-finish"](el, ctx);
    ctx.ui.onbStep = cur + 1;
    ctx.rerender();
  },
  "onb-back": (el, ctx) => {
    ctx.ui.onbStep = Math.max(0, (Number(ctx.ui.onbStep) || 0) - 1);
    ctx.rerender();
  },
  "onb-skip": async (el, ctx) => {
    await store.setProfile({ onboarded: true });
    ctx.toast("Tour skipped — you can change everything in Settings.", "info");
    ctx.navigate("#/dashboard");
  },
  "onb-finish": async (el, ctx) => {
    await store.setProfile({ onboarded: true });
    ctx.toast("You're all set. Go get that streak. 🔥", "ok");
    ctx.navigate("#/dashboard");
  },
  "onb-upgrade": async (el, ctx) => {
    const prev = el.textContent;
    el.disabled = true;
    el.textContent = "Opening checkout…";
    try {
      await startCheckout({
        receipt: "padhle-onboarding",
        onPaid: async () => {
          await store.setProfile({ onboarded: true });
          ctx.navigate("#/dashboard");
        },
      });
    } catch (err) {
      ctx.toast(err?.message || "Could not start the payment.", "err");
    } finally {
      el.disabled = false;
      el.textContent = prev;
    }
  },

  "reload": () => location.reload(),  "theme-toggle": async (el, ctx) => {
    const next = (store.state.settings.theme === "dark") ? "light" : "dark";
    // Apply the theme attribute immediately so the UI responds even if the
    // async IndexedDB write below is delayed or fails.
    document.documentElement.dataset.theme = next;
    try {
      await store.setSettings({ theme: next });
    } catch (err) {
      console.error("[padhle] failed to persist theme", err);
    }
    ctx.toast(`${next === "dark" ? "Dark" : "Light"} theme.`, "info");
  },
  "nav-back": () => history.back(),
  "sidebar-toggle": (el, ctx) => {
    const appShell = document.querySelector('.app-shell');
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    // Below 1080px the sidebar is an off-canvas drawer, not a collapsible column.
    if (window.matchMedia('(max-width: 1080px)').matches) {
      const open = document.body.classList.toggle('nav-open');
      el?.setAttribute?.('aria-expanded', open ? 'true' : 'false');
      return;
    }
    const isCollapsed = sidebar.classList.toggle('collapsed');
    if (appShell) {
      if (isCollapsed) appShell.classList.add('sidebar-collapsed');
      else appShell.classList.remove('sidebar-collapsed');
    }
    ctx.ui.sidebarOpen = !isCollapsed;
    el?.setAttribute?.('aria-expanded', isCollapsed ? 'false' : 'true');
  },
  "nav-close": () => {
    document.body.classList.remove('nav-open');
    document.querySelector('[data-act="sidebar-toggle"]')?.setAttribute('aria-expanded', 'false');
  },
  "open-toggle": (el, ctx) => {
    const key = el.dataset.key;
    if (ctx.ui.open.has(key)) ctx.ui.open.delete(key); else ctx.ui.open.add(key);
    ctx.rerender();
  },
  "expand-all": (el, ctx) => {
    if (el.dataset.what === "open") {
      store.state.subjects.forEach((s) => ctx.ui.open.add(`sub-${s.id}`));
      store.state.chapters.slice(0, 60).forEach((c) => ctx.ui.open.add(`ch-${c.id}`));
    } else ctx.ui.open.clear();
    ctx.rerender();
  },
  "filter-change": (el, ctx) => { ctx.ui[el.dataset.filter] = el.value; ctx.rerender(); },
  "filters-reset": (el, ctx) => {
    ctx.ui.q = ""; ctx.ui.status = "all"; ctx.ui.scope = "all"; ctx.ui.tag = "all"; ctx.ui.sort = "order";
    ctx.ui.subject = "all"; ctx.ui.nq = ""; ctx.ui.noteKind = "all"; ctx.ui.noteStatus = "all"; ctx.ui.noteSubject = "all"; ctx.ui.notePinned = false;
    ctx.ui.fcQ = ""; ctx.ui.fcStatus = "all"; ctx.ui.pqQ = ""; ctx.ui.pqStatus = "all";
    ctx.rerender();
  },
  "filter-toggle": (el, ctx) => { ctx.ui[el.dataset.filter] = el.checked; ctx.rerender(); },
  "filter-input": (el, ctx) => { ctx.ui[el.dataset.filter] = el.value; ctx.rerender(); },
  "range-set": (el, ctx) => { ctx.ui.range = el.dataset.range; ctx.rerender(); },

  /* subjects */
  "subject-add": (el, ctx) => ctx.openModal(subjectModal()),
  "subject-edit": (el, ctx) => ctx.openModal(subjectModal(store.subject(el.dataset.id))),
  "subject-delete": (el, ctx) => {
    const s = store.subject(el.dataset.id);
    if (!s) return;
    const n = store.chaptersOf(s.id).length;
    ctx.confirm({
      title: `Delete “${s.name}”?`,
      danger: true, confirmLabel: "Delete subject and everything under it",
      body: `This permanently removes the subject, its <b>${n} chapter${n === 1 ? "" : "s"}</b>, all items, sessions, revisions, notes and planner tasks linked to them. This cannot be undone.`,
      onConfirm: async () => { await store.deleteSubject(s.id); ctx.toast("Subject deleted.", "ok"); },
    });
  },

  /* chapters */
  "chapter-edit": (el, ctx) => ctx.openModal(chapterModal(store.chapter(el.dataset.id))),
  "chapter-delete": (el, ctx) => {
    const c = store.chapter(el.dataset.id);
    if (!c) return;
    const kids = store.nodesOf(c.id).length;
    const ses = store.state.sessions.filter((s) => s.chapterId === c.id).length;
    ctx.confirm({
      title: `Delete “${c.name}”?`,
      danger: true, confirmLabel: "Delete chapter",
      body: `This removes the chapter, ${kids} item${kids === 1 ? "" : "s"}, ${ses} logged session${ses === 1 ? "" : "s"}, and every revision/note/planner task attached to it.`,
      onConfirm: async () => { await store.deleteChapter(c.id); ctx.toast("Chapter deleted.", "ok"); ctx.navigate("#/syllabus"); },
    });
  },
  "chapter-status": async (el, ctx) => { await store.updateChapter(el.dataset.id, { status: el.value }); ctx.toast("Status updated.", "ok"); },
  "chapter-deadline": async (el, ctx) => { await store.updateChapter(el.dataset.id, { deadline: el.value }); ctx.toast(el.value ? `Deadline set to ${fmtShort(el.value)}.` : "Deadline cleared.", "ok"); },
  "chapter-tick-all": (el, ctx) => {
    const c = store.chapter(el.dataset.id);
    const want = el.dataset.value === "1";
    ctx.confirm({
      title: want ? `Tick every item in “${c.name}”?` : `Clear every item in “${c.name}”?`,
      danger: !want, confirmLabel: want ? "Tick all items" : "Clear all items",
      body: want ? "Each item is marked done as of today — useful after you have genuinely finished the chapter." : "Every item goes back to “To Do”, including your completion dates.",
      onConfirm: async () => {
        const nodes = store.nodesOf(c.id);
        await store.batch(async () => {
          for (const n of nodes) { if (!!n.done !== want) await store.toggleNodeDone(n.id); }
          if (!nodes.length) await store.updateChapter(c.id, { done: want, status: want ? "Done" : "To Do" });
        });
        ctx.toast(want ? "All items ticked." : "All items cleared.", "ok");
      },
    });
  },
  "toggle-chapter": async (el, ctx) => { await store.toggleChapterDone(el.dataset.id); },
  "toggle-node": async (el, ctx) => { await store.toggleNodeDone(el.dataset.id); },

  /* nodes */
  "node-edit": (el, ctx) => {
    const n = store.node(el.dataset.id);
    if (n) ctx.openModal(nodeModal(n));
  },
  "node-delete": (el, ctx) => {
    const n = store.node(el.dataset.id);
    if (!n) return;
    const kids = store.state.nodes.filter((x) => x.parentId === n.id).length;
    ctx.confirm({
      title: `Delete “${n.name}”?`, danger: true, confirmLabel: "Delete item",
      body: kids ? `This also deletes ${kids} nested item${kids === 1 ? "" : "s"} and any notes or revisions attached to them.` : "Any notes or revisions attached to this item are removed too.",
      onConfirm: async () => { await store.deleteNode(n.id); ctx.toast("Item deleted.", "ok"); },
    });
  },
  "node-move": async (el, ctx) => { await store.reorderNode(el.dataset.id, el.dataset.dir); },
  "tag-remove": async (el, ctx) => {
    const tag = el.dataset.tag;
    const chapterId = el.dataset.chapter || (ctx.route.name === "chapter" ? ctx.params[0] : null);
    if (!chapterId) return;
    const c = store.chapter(chapterId);
    if (!c) return;
    await store.updateChapter(chapterId, { tags: (c.tags || []).filter((t) => t !== tag) });
    ctx.toast(`Removed “${tag}” from this chapter.`, "info");
  },

  /* sessions */
  "session-add": (el, ctx) => {
    const chapterId = el.dataset.chapter || (ctx.route.name === "chapter" ? ctx.params[0] : null);
    let nodeId = el.dataset.node || null;
    if (!chapterId && !nodeId) {
      const t = store.state.settings.timer;
      ctx.openModal(sessionModal({ chapterId: t.chapterId, nodeId: t.nodeId }));
      return;
    }
    if (!nodeId && chapterId) {
      const pool = store.nodesOf(chapterId).filter((n) => !n.done && !store.childNodes(n.id).length);
      nodeId = pool.length === 1 ? pool[0].id : null;
    }
    ctx.openModal(sessionModal({ chapterId, nodeId }));
  },
  "session-edit": (el, ctx) => {
    const s = store.state.sessions.find((x) => x.id === el.dataset.id);
    if (s) ctx.openModal(sessionModal({ existing: s }));
  },
  "session-delete": (el, ctx) => {
    const s = store.state.sessions.find((x) => x.id === el.dataset.id);
    if (!s) return;
    ctx.confirm({
      title: "Delete this session?", danger: true, confirmLabel: "Delete session",
      body: `Removes ${fmtDuration(s.minutes)} logged on ${fmtShort(s.dateISO)}. Your completion ticks are not affected.`,
      onConfirm: async () => { await store.deleteSession(s.id); ctx.toast("Session deleted.", "ok"); },
    });
  },

  /* revisions */
  "revision-add": (el, ctx) => {
    const chapterId = el.dataset.chapter || (ctx.route.name === "chapter" ? ctx.params[0] : null);
    ctx.openModal(revisionModal({ chapterId, nodeId: el.dataset.node || null }));
  },
  "revision-delete": (el, ctx) => {
    ctx.confirm({
      title: "Delete this revision record?", danger: true, confirmLabel: "Delete record",
      body: "The revision history loses this pass. Study sessions and completion ticks are untouched.",
      onConfirm: async () => { await store.deleteRevision(el.dataset.id); ctx.toast("Revision record deleted.", "ok"); },
    });
  },

  /* notes */
  "note-add": (el, ctx) => ctx.openModal(noteModal({
    kind: el.dataset.kind || "note",
    chapterId: el.dataset.chapter || (ctx.route.name === "chapter" ? ctx.params[0] : null),
    nodeId: el.dataset.node || null,
  })),
  "note-edit": (el, ctx) => {
    const n = store.state.notes.find((x) => x.id === el.dataset.id);
    if (n) ctx.openModal(noteModal({ existing: n }));
  },
  "note-delete": (el, ctx) => {
    ctx.confirm({
      title: "Delete this entry?", danger: true, confirmLabel: "Delete",
      body: "The note or doubt is removed permanently.",
      onConfirm: async () => { await store.deleteNote(el.dataset.id); ctx.toast("Deleted.", "ok"); },
    });
  },
  "note-pin": async (el, ctx) => {
    const n = store.state.notes.find((x) => x.id === el.dataset.id);
    if (n) { await store.updateNote(n.id, { pinned: !n.pinned }); ctx.toast(n.pinned ? "Unpinned." : "Pinned to the top.", "info"); }
  },
  "doubt-toggle": async (el, ctx) => {
    const n = store.state.notes.find((x) => x.id === el.dataset.id);
    if (!n) return;
    const next = n.doubtStatus === "resolved" ? "unresolved" : "resolved";
    await store.updateNote(n.id, { doubtStatus: next });
    ctx.toast(next === "resolved" ? "Doubt marked resolved. 🎉" : "Doubt reopened.", next === "resolved" ? "ok" : "warn");
  },

  /* planner */
  "planner-add": (el, ctx) => ctx.openModal(plannerModal({ dateISO: el.dataset.date || todayISO(), chapterId: el.dataset.chapter || null })),
  "planner-edit": (el, ctx) => {
    const t = store.state.planner.find((x) => x.id === el.dataset.id);
    if (t) ctx.openModal(plannerModal({ dateISO: t.dateISO, existing: t }));
  },
  "planner-toggle": async (el, ctx) => { await store.togglePlannedTask(el.dataset.id); },
  "planner-move": async (el, ctx) => {
    await store.movePlannedTask(el.dataset.id, el.dataset.date);
    ctx.toast(`Moved to ${fmtShort(el.dataset.date)}.`, "ok");
  },
  "planner-delete": async (el, ctx) => { await store.deletePlannedTask(el.dataset.id); ctx.toast("Task removed from the plan.", "ok"); },
  "planner-goto": (el, ctx) => ctx.navigate(`#/planner/${el.value}`),
  "plan-quick-add": async (el, ctx) => {
    await store.addPlannedTask({
      title: el.dataset.title, chapterId: el.dataset.chapter || null,
      dateISO: el.dataset.date || todayISO(), estMin: Number(el.dataset.est) || 30, priority: "P1",
    });
    ctx.toast(`Added “${el.dataset.title}” to ${fmtShort(el.dataset.date || todayISO())}.`, "ok");
  },
  "planner-carry": (el, ctx) => {
    const to = el.dataset.date;
    const from = el.dataset.from;
    const pool = from === "all"
      ? store.state.planner.filter((t) => !t.done && t.dateISO < to)
      : store.state.planner.filter((t) => !t.done && t.dateISO === from);
    if (!pool.length) { ctx.toast("Nothing to move.", "info"); return; }
    ctx.confirm({
      title: `Move ${pool.length} unfinished task${pool.length === 1 ? "" : "s"} to ${fmtShort(to)}?`,
      confirmLabel: "Move them",
      body: "They keep their estimated minutes and are marked as rescheduled, so you can see they slipped.",
      onConfirm: async () => {
        await store.batch(async () => { for (const t of pool) await store.movePlannedTask(t.id, to); });
        ctx.toast(`${pool.length} task(s) moved.`, "ok");
      },
    });
  },
  "planner-move-open": (el, ctx) => {
    const from = el.dataset.date, to = el.dataset.target;
    const target = Number(store.state.settings.dailyTargetMin) || 0;
    const open = store.plannerOn(from).filter((t) => !t.done).sort((a, b) => (a.priority || "P2").localeCompare(b.priority || "P2"));
    let running = open.reduce((a, t) => a + (Number(t.estMin) || 0), 0);
    const movers = [];
    for (const t of [...open].reverse()) { if (running <= target) break; movers.push(t); running -= Number(t.estMin) || 0; }
    if (!movers.length) { ctx.toast("Nothing needs moving.", "info"); return; }
    ctx.confirm({
      title: `Move ${movers.length} lowest-priority task${movers.length === 1 ? "" : "s"} to ${fmtShort(to)}?`,
      confirmLabel: "Balance the days",
      body: `Frees about ${fmtDuration(movers.reduce((a, t) => a + (Number(t.estMin) || 0), 0))}: ${movers.map((t) => esc(t.title)).join(", ")}.`,
      onConfirm: async () => {
        await store.batch(async () => { for (const t of movers) await store.movePlannedTask(t.id, to); });
        ctx.toast("Days rebalanced.", "ok");
      },
    });
  },
  "plan-load": (el, ctx) => {
    const date = el.dataset.date || todayISO();
    ctx.confirm({
      title: `Load the 60-day plan starting ${fmtShort(date)}?`,
      confirmLabel: "Load the plan",
      body: "The plan's study blocks become planner tasks. Rows that match an official chapter are linked to it; generic rows (setup, diagnostics, weekly tests, rest) stay standalone. Anything already in the planner is kept.",
      onConfirm: async () => {
        const res = await store.loadPlanTemplate(date, { replace: false });
        ctx.toast(`Loaded ${res.added} tasks (${res.matched} linked to chapters).`, "ok");
        ctx.navigate(`#/planner/${date}`);
      },
    });
  },
  "planner-clear-all": (el, ctx) => {
    ctx.confirm({
      title: "Delete every planner task?", danger: true, confirmLabel: "Delete all planner tasks",
      body: `Removes ${store.state.planner.length} tasks. Study sessions and chapters are untouched.`,
      onConfirm: async () => {
        await store.batch(async () => { for (const t of [...store.state.planner]) await store.deletePlannedTask(t.id); });
        ctx.toast("Planner cleared.", "ok");
      },
    });
  },

  /* timer */
  "timer-start": async (el, ctx) => {
    const t = store.state.settings.timer;
    if (t.running) { ctx.toast("A session is already running.", "warn"); return; }
    await store.startTimer({
      subjectId: store.state.settings.timer.subjectId || null,
      chapterId: store.state.settings.timer.chapterId || null,
      nodeId: store.state.settings.timer.nodeId || null,
      activity: store.state.settings.timer.activity || "learn",
    });
    // On Android this arms a system alarm, so the nudge still arrives with the
    // app closed. In a browser it is a no-op.
    syncTimerAlarm(store, ctx.ui.timerBlock);
    ctx.toast("Timer started.", "ok");
  },
  "timer-pause": async (el, ctx) => { await store.pauseTimer(); syncTimerAlarm(store, ctx.ui.timerBlock); ctx.toast("Timer paused.", "info"); },
  "timer-resume": async (el, ctx) => { await store.resumeTimer(); syncTimerAlarm(store, ctx.ui.timerBlock); ctx.toast("Timer resumed.", "ok"); },
  "timer-stop": async (el, ctx) => {
    const res = await store.stopTimer();
    clearTimerEndAlarm();
    if (!res) { ctx.toast("No running session.", "warn"); return; }
    if (res.minutes <= 0) { ctx.toast("That session was under a minute — nothing saved.", "warn"); return; }
    ctx.toast(`Saved ${fmtDuration(res.minutes)}.${res.warning ? ` ${res.warning}` : ""}`, res.warning ? "warn" : "ok");
  },
  "timer-discard": (el, ctx) => {
    ctx.confirm({
      title: "Discard the running session?", danger: true, confirmLabel: "Discard — save nothing",
      body: "No session record will be written. Use this when you started the timer by mistake.",
      onConfirm: async () => { await store.discardTimer(); clearTimerEndAlarm(); ctx.toast("Session discarded.", "info"); },
    });
  },
  "timer-target": async (el, ctx) => {
    const field = el.dataset.field;
    const patch = { [field]: el.value || null };
    if (field === "subjectId") { patch.chapterId = null; patch.nodeId = null; }
    if (field === "chapterId") { patch.nodeId = null; }
    await store.setSettings({ timer: { ...store.state.settings.timer, ...patch } });
  },
  "timer-block": (el, ctx) => {
    ctx.ui.timerBlock = Math.max(5, Math.min(240, Number(el.value) || 30));
    // Changing the length of the block should move the alarm with it.
    syncTimerAlarm(store, ctx.ui.timerBlock);
    ctx.rerender();
  },
  "timer-note": async (el, ctx) => { await store.setSettings({ timer: { ...store.state.settings.timer, note: el.value } }); },

  /* calendar */
  "cal-nav": (el, ctx) => { ctx.ui.calMonth = el.dataset.month; ctx.rerender(); },
  "cal-select": (el, ctx) => { ctx.ui.calSelected = el.dataset.date; ctx.rerender(); },

  /* tags */
  "tag-add": (el, ctx) => ctx.openModal(tagModal()),
  "tag-edit": (el, ctx) => ctx.openModal(tagModal(store.tag(el.dataset.id))),
  "tag-delete": (el, ctx) => {
    const t = store.tag(el.dataset.id);
    if (!t) return;
    ctx.confirm({
      title: `Delete the tag “${t.label}”?`, danger: true, confirmLabel: "Delete tag",
      body: "The tag is removed from every chapter and item that uses it. The records themselves stay.",
      onConfirm: async () => { await store.deleteTag(t.id); ctx.toast("Tag deleted.", "ok"); },
    });
  },

  /* deadlines */
  "deadlines-generate": async (el, ctx) => {
    const res = await store.ensureDefaultDeadlines();
    ctx.toast(res.assigned ? `Generated ${res.assigned} default deadline(s).` : "Every chapter already has a deadline.", "ok");
  },
  "deadlines-clear": (el, ctx) => {
    ctx.confirm({
      title: "Clear generated deadlines?", confirmLabel: "Clear generated deadlines",
      body: "Only deadlines that you have never edited are removed. Your own deadlines survive.",
      onConfirm: async () => { const r = await store.clearDefaultDeadlines(); ctx.toast(`Cleared ${r.cleared} generated deadline(s).`, "ok"); },
    });
  },

  /* data */
  "export-json": (el, ctx) => {
    downloadJson(`padhle-wtf-backup-${todayISO()}.json`, store.exportBundle());
    store.setSettings({ lastBackupAt: new Date().toISOString() });
    ctx.toast("Full backup downloaded.", "ok");
  },
  "export-csv": (el, ctx) => {
    const what = el.dataset.what;
    const { rows, columns } = csvFor(what, ctx);
    downloadCsv(`padhle-wtf-${what}-${todayISO()}.csv`, rows, columns);
    ctx.toast(`${what} exported.`, "ok");
  },

  /* notifications — native Android or the browser Notification API */
  "notifications-request": async (el, ctx) => {
    const state = await requestReminderPermission();
    if (state === "granted") syncDailyReminder(store);
    ctx.toast(
      state === "granted" ? "Notifications are allowed."
        : state === "denied" ? "Notifications are blocked — allow them in your browser or system settings."
          : state === "unsupported" ? "This browser does not support notifications."
            : "Asked for notification permission.",
      state === "granted" ? "ok" : "info",
    );
    ctx.rerender();
  },
  "notifications-test": (el, ctx) => {
    const sent = sendTestReminder(store);
    ctx.toast(sent ? "Sent a test notification." : "Allow notifications first, then try again.", sent ? "ok" : "info");
  },

  /* settings forms are handled by the submit layer; these are extra buttons */
  "clear-study": (el, ctx) => {
    ctx.confirm({
      title: "Clear all study data?", danger: true, confirmLabel: "Delete sessions, notes, planner and ticks",
      body: "Removes every session, revision, note, planner task and completion tick. The syllabus, subjects, chapters, items and tags stay. This cannot be undone.",
      onConfirm: async () => { await store.clearStudyData(); ctx.toast("Study data cleared.", "ok"); },
    });
  },
  "reset-all": (el, ctx) => {
    ctx.confirm({
      title: "Reset everything?",
      danger: true, confirmLabel: "Delete everything and start fresh",
      requireText: "RESET",
      body: "Removes every session, revision, note, planner task, completion tick and custom item you created, then restores the official syllabus and default tags and resets your preferences. This cannot be undone.",
      onConfirm: async () => { await store.resetAll(); ctx.toast("Everything reset to a fresh start.", "ok"); },
    });
  },
  "account-reset-data": (el, ctx) => {
    if (!isSignedIn()) { ctx.toast("Sign in to reset your account data.", "err"); return; }
    ctx.confirm({
      title: "Reset your account data?",
      danger: true,
      confirmLabel: "Reset subjects, preferences and study data",
      requireText: "RESET",
      body: "This clears your subject selection and preferences from your account, and deletes sessions, revisions, notes, planner tasks and ticks from your account's stored records. Your email, username and login stay. This cannot be undone.",
      onConfirm: async () => {
        const profile = account.profile;
        await resetAccountData();
        await store.resetAll();
        if (profile) {
          await store.setProfile({
            displayName: profile.displayName,
            avatar: profile.avatar,
            onboarded: true,
          });
        }
        ctx.toast("Account data reset. Choose your subjects to start again.", "ok");
        ctx.navigate("#/choose-subjects");
      },
    });
  },
  "account-delete": (el, ctx) => {
    if (!isSignedIn()) { ctx.toast("Sign in to delete your account.", "err"); return; }
    ctx.confirm({
      title: "Delete your account permanently?",
      danger: true,
      confirmLabel: "Delete my account",
      requireText: "DELETE",
      body: "This deletes your email login, username, profile, subject selection and preferences, and clears your stored study data. There is no recovery.",
      onConfirm: async () => {
        await deleteAccount();
        await store.resetAll();
        ctx.toast("Your account has been deleted.", "ok");
        ctx.navigate("#/welcome");
      },
    });
  },

  /* profile, gamification & sharing */
  "profile-edit": (el, ctx) => {
    const s = store.state.settings;
    ctx.openModal({
      title: "Edit profile",
      body: `<div class="stack gap-3">
        ${field("displayName", "Display name", s.displayName || "Student", { required: true, placeholder: "Your name", hint: "Shown on your share cards. Never your email." })}
        ${field("avatar", "Avatar", s.avatar || "🦉", { placeholder: "🦉", hint: "One or two characters or an emoji." })}
      </div>`,
      submitLabel: "Save profile",
      onSubmit: async (form) => {
        await store.setProfile({ displayName: val(form, "displayName"), avatar: val(form, "avatar") });
        ctx.toast("Profile saved.", "ok");
      },
    });
  },
  "share-kind": (el, ctx) => { ctx.ui.shareKind = el.value; ctx.rerender(); },
  "share-format": async (el, ctx) => { await store.setProfile({ shareFormat: el.value }); ctx.rerender(); },
  "share-png": async (el, ctx) => {
    const model = currentShareModel(ctx);
    if (!model) { ctx.toast("There is nothing to share yet.", "err"); return; }
    // The card always wears the app's one design.
    const theme = "looseleaf";
    const { shareFormat: format } = store.state.settings;
    await withBusy(el, "Rendering…", async () => {
      try {
        const blob = await renderCardPng(model, theme, format);
        downloadBlob(`padhle-wtf-${model.kind.toLowerCase()}.png`, blob);
        ctx.toast("PNG downloaded.", "ok");
      } catch (e) { ctx.toast(e?.message || "Could not render the card.", "err"); }
    });
  },
  "share-gif": async (el, ctx) => {
    const model = currentShareModel(ctx);
    if (!model) { ctx.toast("There is nothing to share yet.", "err"); return; }
    const theme = "looseleaf";
    const { shareFormat: format } = store.state.settings;
    await withBusy(el, "Encoding GIF…", async () => {
      try {
        const blob = await renderCardGif(model, theme, format);
        downloadBlob(`padhle-wtf-${model.kind.toLowerCase()}.gif`, blob);
        ctx.toast("Animated GIF downloaded.", "ok");
      } catch (e) { ctx.toast(e?.message || "Could not encode the GIF.", "err"); }
    });
  },
  "vote-excitement": async (el, ctx) => {
    await store.setExcitementVote(el.dataset.choice, store.state.settings.excitementNote);
    const note = q("excitement-note")?.value;
    if (note !== undefined) await store.setExcitementVote(el.dataset.choice, note);
    ctx.toast("Thanks for voting!", "ok");
  },
  "vote-note-save": async (el, ctx) => {
    const note = q("excitement-note")?.value || "";
    await store.setExcitementVote(store.state.settings.excitementVote, note);
    ctx.toast("Note saved.", "ok");
  },
};

export function csvFor(what, ctx) {
  const { store } = ctx;
  if (what === "syllabus") {
    return {
      rows: store.state.chapters.map((c) => {
        const st = store.progressOf(c.id);
        return { ...c, subject: store.subject(c.subjectId)?.name || "", progressPct: st?.pct, done: st?.done, leaves: st?.leaves, minutes: st?.minutes, passes: st?.passes };
      }),
      columns: [
        { label: "Subject", value: "subject" }, { label: "Chapter", value: "name" }, { label: "Unit", value: "unit" },
        { label: "Scope", value: "scope" }, { label: "Priority", value: "priority" }, { label: "Difficulty", value: "difficulty" },
        { label: "Tier", value: "globalTier" }, { label: "Deadline", value: "deadline" }, { label: "ItemsDone", value: "done" },
        { label: "ItemsTotal", value: "leaves" }, { label: "ProgressPct", value: "progressPct" }, { label: "RevisionPasses", value: "passes" },
        { label: "MinutesLogged", value: "minutes" }, { label: "Tags", value: (r) => (r.tags || []).join("; ") }, { label: "NextAction", value: "nextAction" },
      ],
    };
  }
  if (what === "sessions") {
    return {
      rows: store.state.sessions,
      columns: [
        { label: "Date", value: "dateISO" }, { label: "Minutes", value: "minutes" }, { label: "Activity", value: "activity" },
        { label: "Subject", value: (r) => store.subject(r.subjectId)?.name || "" },
        { label: "Chapter", value: (r) => store.chapter(r.chapterId)?.name || "" },
        { label: "Item", value: (r) => store.node(r.nodeId)?.name || "" },
        { label: "Source", value: "source" }, { label: "Notes", value: "notes" }, { label: "Outcome", value: "outcome" },
      ],
    };
  }
  if (what === "revisions") {
    return {
      rows: store.state.revisions,
      columns: [
        { label: "Date", value: "dateISO" }, { label: "Pass", value: "pass" }, { label: "Score", value: "score" },
        { label: "Subject", value: (r) => store.subject(r.subjectId)?.name || "" },
        { label: "Chapter", value: (r) => store.chapter(r.chapterId)?.name || "" },
        { label: "Item", value: (r) => (r.targetType === "node" ? store.node(r.targetId)?.name || "" : "") },
        { label: "Notes", value: "notes" },
      ],
    };
  }
  if (what === "notes") {
    return {
      rows: store.state.notes,
      columns: [
        { label: "Kind", value: "kind" }, { label: "Status", value: "doubtStatus" }, { label: "Text", value: "text" },
        { label: "Subject", value: (r) => store.subject(r.subjectId)?.name || "" },
        { label: "Chapter", value: (r) => store.chapter(r.chapterId)?.name || "" },
        { label: "Item", value: (r) => store.node(r.nodeId)?.name || "" },
        { label: "Pinned", value: (r) => (r.pinned ? "yes" : "") }, { label: "Updated", value: "updatedAt" },
      ],
    };
  }
  return {
    rows: store.state.planner,
    columns: [
      { label: "Date", value: "dateISO" }, { label: "Task", value: "title" }, { label: "Detail", value: "task" },
      { label: "Target", value: "target" }, { label: "Minutes", value: "estMin" }, { label: "Priority", value: "priority" },
      { label: "Subject", value: (r) => store.subject(r.subjectId)?.short || r.subjectLabel || "" },
      { label: "Chapter", value: (r) => store.chapter(r.chapterId)?.name || "" },
      { label: "Done", value: (r) => (r.done ? "yes" : "") }, { label: "MovedFrom", value: "movedFrom" },
    ],
  };
}

/* ------------------------------------------------------------ form submit -- */
export async function handleFormSubmit(form, ctx) {
  const kind = form.dataset.form;
  if (kind === "settings-theme") {
    const theme = val(form, "theme") === "dark" ? "dark" : "light";
    // Apply immediately so the save button never feels laggy.
    document.documentElement.dataset.theme = theme;
    await store.setSettings({
      theme,
      reduceMotion: !!form.querySelector('input[name="reduceMotion"]')?.checked,
    });
    ctx.toast("Theme saved.", "ok");
    return;
  }
  if (kind === "settings-targets") {
    const studyDays = [...form.querySelectorAll('input[name="studyDays"]:checked')].map((i) => Number(i.value));
    await store.setSettings({
      targetDate: val(form, "targetDate") || null,
      dailyTargetMin: val(form, "dailyTargetMin") === "" ? 0 : val(form, "dailyTargetMin"),
      availableTodayMin: val(form, "availableTodayMin") === "" ? 0 : val(form, "availableTodayMin"),
      studyDays,
    });
    ctx.toast("Daily targets saved.", "ok");
    return;
  }
  if (kind === "settings") {
    // Backwards-compatible alias for older exported views/bookmarks.
    const data = readForm(form);
    const studyDays = [...form.querySelectorAll('input[name="studyDays"]:checked')].map((i) => Number(i.value));
    await store.setSettings({
      targetDate: data.targetDate || null,
      planStartDate: data.planStartDate || null,
      dailyTargetMin: data.dailyTargetMin === "" ? 0 : data.dailyTargetMin,
      availableTodayMin: data.availableTodayMin === "" ? 0 : data.availableTodayMin,
      dueWarnDays: data.dueWarnDays,
      theme: data.theme,
      studyDays,
      reduceMotion: !!form.querySelector('input[name="reduceMotion"]')?.checked,
    });
    ctx.toast("Preferences saved.", "ok");
    return;
  }
  if (kind === "plan-load") {
    const startDate = val(form, "startDate") || todayISO();
    const replace = val(form, "replace") === "1";
    const res = await store.loadPlanTemplate(startDate, { replace });
    ctx.toast(`Loaded ${res.added} tasks (${res.matched} linked to chapters).`, "ok");
    return;
  }
  if (kind === "reminders") {
    const enabled = !!form.querySelector('input[name="reminderEnabled"]')?.checked;
    const time = val(form, "reminderTime") || "19:30";
    const timerEnd = !!form.querySelector('input[name="notifyTimerEnd"]')?.checked;
    let permission = null;
    // requestPermission() must run inside the submit gesture. Saving the
    // preference is still useful if the student declines: it will apply later
    // once notifications are allowed.
    if (enabled && !isNative()) permission = await requestReminderPermission();
    await store.setSettings({ reminderEnabled: enabled, reminderTime: time, notifyTimerEnd: timerEnd });
    syncDailyReminder(store);
    if (timerEnd) syncTimerAlarm(store, ctx.ui?.timerBlock ?? 30);
    else clearTimerEndAlarm();
    if (enabled && permission && permission !== "granted") {
      ctx.toast("Reminder saved. Allow notifications in your browser to receive it.", "info");
    } else {
      ctx.toast(enabled ? `Daily reminder set for ${time}.` : "Daily reminder turned off.", "ok");
    }
    return;
  }
  if (kind === "import") {
    const fileInput = form.elements.file;
    const file = fileInput?.files?.[0];
    if (!file) { ctx.toast("Choose a .json backup file first.", "err"); return; }
    const mode = val(form, "mode") || "replace";
    let bundle;
    try { bundle = await readJsonFile(file); } catch { ctx.toast("That file is not valid JSON.", "err"); return; }
    const v = validateBundle(bundle);
    if (!v.ok) { ctx.toast(`Invalid backup: ${v.errors[0]}`, "err"); return; }
    const counts = bundle.counts || {};
    ctx.confirm({
      title: mode === "replace" ? "Replace all current data?" : "Merge this backup into your data?",
      danger: mode === "replace", confirmLabel: mode === "replace" ? "Replace and restore" : "Merge",
      body: `The file contains ${Object.entries(counts).map(([k, n]) => `<b>${n}</b> ${k}`).join(", ")}. ${mode === "replace" ? "Everything currently stored will be deleted first." : "Records with the same ids are overwritten; your other data stays."}`,
      onConfirm: async () => {
        const res = await store.importBundle(bundle, { mode });
        ctx.toast(`Imported: ${Object.entries(res.counts).map(([k, n]) => `${n} ${k}`).join(", ")}.`, "ok");
      },
    });
    return;
  }
  if (kind === "modal") {
    // handled by the modal's own submit wiring
    return;
  }
  if (kind === "onboarding") {
    const profile = readProfileStep(form, ctx.ui._onb || {});
    ctx.ui._onb = { ...(ctx.ui._onb || {}), ...profile };
    await store.setProfile({ displayName: profile.displayName, avatar: profile.avatar });
    await store.setSettings({ targetDate: profile.targetDate, dailyTargetMin: profile.dailyTargetMin });
    // Profile → subjects → optional account. The last step is never skipped.
    ctx.ui.onbStep = 2;
    ctx.rerender();
    return;
  }
  if (kind === "onboarding-subjects") {
    const ids = [...form.querySelectorAll('input[name="subjects"]:checked')].map((i) => i.value);
    const v = validateSubjectChoice(ids);
    formError(form, "");
    if (!v.ok) { formError(form, v.error); return; }
    try {
      await saveSelection(store, v.value);
      ctx.ui._onb = { ...(ctx.ui._onb || {}), subjects: [...v.value] };
      ctx.ui.subjectDraft = null;
      ctx.ui.onbStep = 3;
      ctx.rerender();
    } catch (err) {
      formError(form, err?.message || "Could not save your subjects.");
    }
    return;
  }
  if (kind === "padhle-signup") {
    const data = readForm(form);
    formError(form, "");
    const username = validateUsername(data.username);
    if (!username.ok) {
      formError(form, username.error);
      return;
    }
    if (data.password !== data.confirm) {
      formError(form, "The two passwords do not match.");
      return;
    }
    try {
      // Check before creating the auth user so a taken name is a clear,
      // pre-signup error. The database's unique index remains the authority.
      const availability = await checkUsernameAvailability(username.value);
      if (availability.ok && availability.available === false) {
        formError(form, "That username is already taken. Choose another.");
        return;
      }
      const result = await signUpAccount(data.email, data.password, { username: username.value });
      if (result.needsConfirmation) {
        ctx.rerender();
        return;
      }
      ctx.ui.profileDraft = { username: username.value };
      ctx.toast("Account created. Finish your profile.", "ok");
      ctx.rerender();
    } catch (err) {
      formError(form, err?.message || "Could not create your account.");
    }
    return;
  }
  if (kind === "padhle-login") {
    const data = readForm(form);
    formError(form, "");
    try {
      await signInAccount(data.email, data.password);
      ctx.toast("Welcome back.", "ok");
      ctx.rerender();
    } catch (err) {
      if (err?.code === "email_not_confirmed" || /confirm your email/i.test(err?.message || "")) {
        setPendingEmail(data.email);
      }
      formError(form, err?.message || "Could not log in.");
    }
    return;
  }
  if (kind === "padhle-forgot") {
    const data = readForm(form);
    formError(form, "");
    try {
      await resetPassword(data.email);
      ctx.toast("Password reset link sent to your email. Check your inbox (and spam).", "ok");
      ctx.ui.authMode = "login";
      ctx.rerender();
    } catch (err) {
      formError(form, err?.message || "Could not send reset link.");
    }
    return;
  }
  if (kind === "padhle-profile") {
    const data = readForm(form);
    const editing = hasProfile();
    const avatar = form.querySelector('input[name="avatar"]:checked')?.value || "🦉";
    formError(form, "");
    try {
      await createProfile({ username: data.username, displayName: data.displayName, avatar });
      ctx.ui.profileDraft = null;
      ctx.toast(editing ? "Profile saved." : "Profile created.", "ok");
      ctx.navigate(editing ? "#/account" : "#/choose-subjects");
    } catch (err) {
      formError(form, err?.message || "Could not save your profile.");
    }
    return;
  }
  if (kind === "padhle-subjects") {
    const ids = [...form.querySelectorAll('input[name="subjects"]:checked')].map((i) => i.value);
    const v = validateSubjectChoice(ids);
    formError(form, "");
    if (!v.ok) { formError(form, v.error); return; }
    try {
      await saveSelection(store, v.value);
      ctx.ui.subjectDraft = null;
      ctx.toast("Subjects saved. Your dashboard is ready.", "ok");
      ctx.navigate("#/dashboard");
    } catch (err) {
      formError(form, err?.message || "Could not save your subjects.");
    }
    return;
  }
  if (kind === "delete-confirm") return;
}
