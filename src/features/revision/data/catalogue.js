/**
 * catalogue.js — revision catalogue reads from Supabase.
 *
 * The flashcard and question catalogues live in the shared `revision_flashcards`
 * and `revision_questions` tables, seeded once by the deployment and read by
 * every student. The browser no longer downloads per-chapter JSON files from
 * /catalogue/v2 — it queries PostgREST instead.
 *
 * `ensureRevisionContent()` (in repository.js) confirms the tables are readable;
 * this module only reads.
 */

import { callRpc } from "../../../core/supabase.js?v=mwz6nuk5";
import { listFlashcards, listQuestions } from "./repository.js?v=mwz6nuk5";

let indexCache = null;
let indexLoadedAt = 0;

/** Load per-chapter card/question counts from the revision_catalogue_index RPC. */
export async function loadCatalogueIndex() {
  const ttl = 5 * 60 * 1000;
  if (indexCache && Date.now() - indexLoadedAt < ttl) return indexCache;
  try {
    const rows = await callRpc("revision_catalogue_index");
    const list = Array.isArray(rows) ? rows : [];
    indexCache = {
      subjects: [],
      chapters: {},
      totalFlashcards: 0,
      totalQuestions: 0,
    };
    const bySubject = new Map();
    const byChapter = new Map();
    for (const r of list) {
      const subjectId = r.subject_id;
      const chapterId = r.chapter_id;
      if (!bySubject.has(subjectId)) {
        bySubject.set(subjectId, { id: subjectId, chapters: [] });
      }
      const subj = bySubject.get(subjectId);
      subj.chapters.push(chapterId);
      byChapter.set(chapterId, {
        id: chapterId,
        chapterName: r.chapter_name || chapterId,
        subjectId,
        flashcardCount: Number(r.flashcards) || 0,
        questionCount: Number(r.questions) || 0,
      });
      indexCache.totalFlashcards += Number(r.flashcards) || 0;
      indexCache.totalQuestions += Number(r.questions) || 0;
    }
    indexCache.subjects = [...bySubject.values()];
    indexCache.chapters = Object.fromEntries(byChapter);
    indexLoadedAt = Date.now();
    return indexCache;
  } catch (err) {
    console.warn("[catalogue] Could not load index from Supabase:", err?.message || err);
    return null;
  }
}

/** Load flashcards for a single chapter from Supabase. */
export async function loadChapterFlashcards(chapterId) {
  try {
    return await listFlashcards({ chapterId }) || [];
  } catch (err) {
    console.warn("[catalogue] Could not load flashcards for", chapterId, err.message);
    return null;
  }
}

/** Load questions for a single chapter from Supabase. */
export async function loadChapterQuestions(chapterId) {
  try {
    return await listQuestions({ chapterId }) || [];
  } catch (err) {
    console.warn("[catalogue] Could not load questions for", chapterId, err.message);
    return null;
  }
}

/** Return the subject list from the index. */
export function getSubjects(index) {
  return (index && index.subjects) || [];
}

/** Return chapters for a subject, with names and counts. */
export function getChaptersForSubject(index, subjectId) {
  if (!index) return [];
  const subj = index.subjects?.find((s) => s.id === subjectId);
  if (!subj) return [];
  return subj.chapters
    .map((cid) => {
      const c = index.chapters?.[cid];
      return c
        ? { id: cid, name: c.chapterName || cid, subjectId: c.subjectId }
        : { id: cid, name: cid, subjectId };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Return { flashcards, questions } counts for a chapter. */
export function getChapterCounts(index, chapterId) {
  const c = index?.chapters?.[chapterId];
  return c
    ? { flashcards: c.flashcardCount, questions: c.questionCount }
    : { flashcards: 0, questions: 0 };
}

/** Total flashcard count across all chapters (from index). */
export function totalFlashcards(index) {
  return index?.totalFlashcards ?? 0;
}

/** Total question count across all chapters (from index). */
export function totalQuestions(index) {
  return index?.totalQuestions ?? 0;
}
