/**
 * selection.js — the one place that answers "which subjects is this student
 * studying?".
 *
 * The selection lives in Supabase, on the student's own `profile_subjects`
 * rows. Views must never read that source directly, so the filtering rules
 * cannot drift between the dashboard, syllabus, planner, analytics and the rest
 * of the app.
 */
import { account, isSignedIn, saveSubjectSelection } from "../core/account.js?v=mwz7i9p1";
import { todayISO } from "../core/dates.js?v=mwz7i9p1";
import {
  ALL_SUBJECT_IDS as ALL_SUBJECTS,
  CORE_SUBJECT_IDS,
  isCoreSubject, isOptionalSubject,
  validateSubjectChoice, visibleSubjectIds,
} from "../core/subjects.js?v=mwz7i9p1";

/** The active selection, or null when nothing has been chosen (show all). */
export function currentSelection(store) {
  if (isSignedIn()) {
    return account.selection?.saved ? account.selection : null;
  }
  return null;
}

/** Set of visible subject ids, or null meaning "everything". */
export function visibleIds(store) {
  return visibleSubjectIds(currentSelection(store));
}

/** Stable cache key for the current selection ("all" when unfiltered). */
export function selectionKey(store) {
  const ids = visibleIds(store);
  return ids ? [...ids].sort().join(",") : "all";
}

/**
 * A subject is visible when it belongs to the explicit selection. Subjects the
 * student created themselves are not part of the curated catalogue, so they are
 * always shown — otherwise a custom subject would vanish the moment a selection
 * was saved.
 */
function idVisible(ids, subjectId) {
  if (!ids || !subjectId) return true;
  if (ids.has(subjectId)) return true;
  return !ALL_SUBJECTS.includes(subjectId);
}

export function isVisibleSubject(store, subjectId) {
  return idVisible(visibleIds(store), subjectId);
}

/** Subjects in syllabus order, narrowed to the selection. */
export function visibleSubjects(store) {
  return store.subjectsSorted().filter((s) => isVisibleSubject(store, s.id));
}

/** Chapters belonging to a visible subject. */
export function visibleChapters(store, chapters = store.state.chapters) {
  const ids = visibleIds(store);
  if (!ids) return chapters;
  return chapters.filter((c) => idVisible(ids, c.subjectId));
}

/** Filter any record list by a subject id getter; subjectless records stay. */
export function filterBySubject(store, items, getSubjectId = (x) => x.subjectId) {
  const ids = visibleIds(store);
  if (!ids) return items;
  return items.filter((x) => idVisible(ids, getSubjectId(x)));
}

/** A planner task can inherit its subject from its chapter. */
export function taskSubjectId(store, task) {
  if (!task) return null;
  return task.subjectId || (task.chapterId ? store.chapter(task.chapterId)?.subjectId : null) || null;
}

/** A revision record can inherit its subject from its chapter. */
export function revisionSubjectId(store, revision) {
  if (!revision) return null;
  return revision.subjectId || (revision.chapterId ? store.chapter(revision.chapterId)?.subjectId : null) || null;
}

/**
 * Aggregated scope counts for the visible subjects. Returns the global scopes
 * unchanged when no selection exists, so callers can use it unconditionally.
 */
export function scopedScopes(store) {
  const progress = store.derived.progress;
  const ids = visibleIds(store);
  if (!ids) return progress.scopes;
  const subjects = progress.subjects.filter((s) => idVisible(ids, s.id));
  const out = {};
  for (const scope of ["board", "internal", "optional", "all"]) {
    const acc = subjects.reduce((a, s) => {
      const x = s.scopes?.[scope];
      if (x) {
        a.done += x.done; a.leaves += x.leaves;
        a.chapters += x.chapters || 0; a.chaptersDone += x.chaptersDone || 0;
      }
      return a;
    }, { done: 0, leaves: 0, chapters: 0, chaptersDone: 0 });
    acc.pct = acc.leaves ? (acc.done / acc.leaves) * 100 : 0;
    out[scope] = acc;
  }
  return out;
}

/**
 * Study-time totals restricted to the visible subjects. Sessions without a
 * subject still count as study time (they are not attributable to a hidden
 * subject), but they never pull a hidden subject's numbers back in.
 */
export function scopedTime(store) {
  const time = store.derived.time;
  const ids = visibleIds(store);
  if (!ids) return time;
  const sessions = store.state.sessions.filter((s) => idVisible(ids, s.subjectId));
  const byDate = new Map();
  const bySubject = new Map();
  const byActivity = new Map();
  let total = 0;
  for (const s of sessions) {
    const m = Number(s.minutes) || 0;
    total += m;
    if (s.dateISO) byDate.set(s.dateISO, (byDate.get(s.dateISO) || 0) + m);
    if (s.subjectId) bySubject.set(s.subjectId, (bySubject.get(s.subjectId) || 0) + m);
    if (s.activity) byActivity.set(s.activity, (byActivity.get(s.activity) || 0) + m);
  }
  const subjectOfOverrun = (x) => {
    if (!x) return null;
    if (x.subjectId) return x.subjectId;
    const chapterId = x.chapterId || x.id;
    return chapterId ? store.chapter(chapterId)?.subjectId || null : null;
  };
  return {
    ...time,
    total,
    today: byDate.get(todayISO()) || 0,
    byDate: Object.fromEntries(byDate),
    bySubject: Object.fromEntries(bySubject),
    byActivity: Object.fromEntries(byActivity),
    longVsEstimate: (time.longVsEstimate || []).filter((x) => {
      const id = subjectOfOverrun(x);
      return idVisible(ids, id);
    }),
  };
}

/** Open doubts / revision queues narrowed to the selection. */
export function scopedNotes(store, notes = store.state.notes) {
  return filterBySubject(store, notes);
}

/**
 * The shape used for a subject selection (kept compatible with the account RPC).
 *
 * `subjects` is the flat, authoritative list. `core` and `optional` are derived
 * and kept only so older readers and the account RPC keep working.
 */
export function localSelection(ids = [...CORE_SUBJECT_IDS]) {
  const subjects = [...ids];
  return {
    subjects,
    core: subjects.filter(isCoreSubject),
    optional: subjects.filter(isOptionalSubject),
    saved: true,
  };
}

/**
 * Validate and persist a flat subject choice. Any combination of the eleven
 * subjects is allowed; at least one must be chosen. The choice is written to
 * the student's own `profile_subjects` rows through the server-side RPC.
 */
export async function saveSelection(store, ids = []) {
  const v = validateSubjectChoice(ids);
  if (!v.ok) throw new Error(v.error);
  const selection = localSelection(v.value);
  if (isSignedIn()) {
    return saveSubjectSelection(selection.core, selection.optional);
  }
  throw new Error("Sign in to choose your subjects.");
}

/** All subject ids in display order, used by the pickers and settings. */
export const ALL_SUBJECT_IDS = [...ALL_SUBJECTS];
