/**
 * subjects.js — the Class 10 subject model shared by the setup screens, the
 * dashboard filter and the backend validation.
 *
 * A student picks freely from all eleven CBSE Class 10 subjects in this app.
 * There is no compulsory/elective split in the product: every subject is just a
 * subject, and the student decides which ones they study. The `CORE_*` and
 * `OPTIONAL_*` lists below are kept only as a storage/back-compat detail (older
 * selections and the account RPC stored a `core` + `optional` shape); the UI
 * always shows one flat list from `ALL_SUBJECT_IDS`.
 *
 * The ids are the app's stable subject ids (see `tools/data/seedData.js` and
 * `tools/data/syllabusSeed.js`), so the Supabase catalog, the local syllabus and
 * the UI all speak the same language.
 */

/** Every subject a student can choose, in syllabus display order. */
export const ALL_SUBJECT_IDS = [
  "sub-math", "sub-sci", "sub-sst", "sub-eng", "sub-hin",
  "sub-ai", "sub-comp", "sub-it", "sub-sskrit", "sub-hin-a", "sub-mathb",
];

/** Minimum number of subjects a student must choose. */
export const SUBJECT_MIN = 1;

/* ---------------------------------------------------------------------------
 * Back-compat aliases. Older selections and the Supabase RPC still speak in
 * terms of "core" and "optional"; the flat model above is the source of truth.
 * ------------------------------------------------------------------------- */

/** The five subjects CBSE treats as compulsory. */
export const CORE_SUBJECT_IDS = ["sub-math", "sub-sci", "sub-sst", "sub-eng", "sub-hin"];

/** The remaining subjects (formerly "electives"). */
export const OPTIONAL_SUBJECT_IDS = ["sub-ai", "sub-comp", "sub-it", "sub-sskrit", "sub-hin-a", "sub-mathb"];

/** Optional subject id → the core subject it replaces. */
const SUBJECT_ALTERNATES = { "sub-mathb": "sub-math" };

export const isCoreSubject = (id) => CORE_SUBJECT_IDS.includes(id);
export const isOptionalSubject = (id) => OPTIONAL_SUBJECT_IDS.includes(id);

/** A short, human label used in validation messages. */
export function subjectLabel(store, id) {
  return store?.subject?.(id)?.name || id;
}

/**
 * Validate a flat list of chosen subject ids.
 * Any combination of the eleven subjects is allowed, as long as at least one is
 * chosen and nothing is duplicated. Returns `{ ok, value, error }` — never
 * throws, so both the UI and tests can use it directly.
 */
export function validateSubjectChoice(ids) {
  if (!Array.isArray(ids)) {
    return { ok: false, error: "Choose subjects from the list.", value: null };
  }
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== "string" || !ALL_SUBJECT_IDS.includes(id)) {
      return { ok: false, error: "One of those subjects is not available.", value: null };
    }
    if (seen.has(id)) {
      return { ok: false, error: "The same subject was selected twice.", value: null };
    }
    seen.add(id);
  }
  if (seen.size < SUBJECT_MIN) {
    return { ok: false, error: `Choose at least ${SUBJECT_MIN} subject.`, value: null };
  }
  return { ok: true, error: null, value: [...ids] };
}

/**
 * Validate a set of optional subject ids (legacy helper). New code should use
 * `validateSubjectChoice`; this stays for the account compatibility path.
 */
export function validateOptionalSelection(ids, allowed = OPTIONAL_SUBJECT_IDS) {
  if (ids == null) return { ok: true, error: null, value: [] };
  if (!Array.isArray(ids)) {
    return { ok: false, error: "Choose subjects from the list.", value: [] };
  }
  const seen = new Set();
  for (const id of ids) {
    if (typeof id !== "string" || !allowed.includes(id)) {
      return { ok: false, error: "One of those subjects is not available as an optional subject.", value: [] };
    }
    if (seen.has(id)) {
      return { ok: false, error: "The same subject was selected twice.", value: [] };
    }
    seen.add(id);
  }
  return { ok: true, error: null, value: [...ids] };
}

/**
 * Validate a legacy `core + optional` pair by flattening it. The account RPC
 * still receives the split, but the rule is the same flat rule: at least one
 * known subject, no duplicates, no category limits.
 */
export function validateSubjectSelection(coreIds, optionalIds) {
  const coreList = Array.isArray(coreIds) ? coreIds : [];
  const optionalList = Array.isArray(optionalIds) ? optionalIds : [];
  const flat = validateSubjectChoice([...coreList, ...optionalList]);
  if (!flat.ok) return { ok: false, error: flat.error, value: null };
  return {
    ok: true,
    error: null,
    value: {
      subjects: [...flat.value],
      core: flat.value.filter(isCoreSubject),
      optional: flat.value.filter(isOptionalSubject),
      saved: true,
    },
  };
}

/**
 * The flat subject ids for a saved selection, or `null` when nothing has been
 * chosen (which means "show everything"). Handles both the current
 * `{ subjects }` shape and the legacy `{ core, optional }` shape.
 */
export function selectionSubjectIds(selection) {
  if (!selection || !selection.saved) return null;
  if (Array.isArray(selection.subjects)) return [...selection.subjects];
  const core = selection.core?.length ? selection.core : CORE_SUBJECT_IDS;
  return [...core, ...(selection.optional || [])];
}

/**
 * The subject ids a student should see on the dashboard.
 *
 * `selection` is the stored choice. When there is no saved selection the caller
 * passes `null`, which means "show everything".
 */
export function visibleSubjectIds(selection) {
  const ids = selectionSubjectIds(selection);
  if (!ids) return null;
  const set = new Set(ids);
  // Mathematics (Basic) replaces Mathematics (Standard) rather than stacking.
  for (const [optionalId, replacedId] of Object.entries(SUBJECT_ALTERNATES)) {
    if (set.has(optionalId)) set.delete(replacedId);
  }
  return set;
}

/** True when the dashboard should hide a subject for this selection. */
export function isSubjectVisible(selection, subjectId) {
  const ids = visibleSubjectIds(selection);
  return ids ? ids.has(subjectId) : true;
}

/** Flat summary used by the setup screens: total selected + the two lists. */
export function selectionSummary(selection) {
  const subjects = selectionSubjectIds(selection) || [...CORE_SUBJECT_IDS];
  return {
    subjects: [...subjects],
    core: subjects.filter(isCoreSubject),
    optional: subjects.filter(isOptionalSubject),
    total: subjects.length,
  };
}
