/**
 * models.js — data model schemas for the Revision Centre feature.
 *
 * These schemas define the shape of every revision record stored in Supabase.
 * They are intentionally decoupled from the UI so the data layer can be swapped
 * without touching views.
 *
 * Subject/chapter IDs follow the app's existing convention:
 *   subjectId: "sub-math", "sub-sci", "sub-eng", etc.
 *   chapterId:  "ch-math-real-numbers", "ch-sci-chemical-reactions", etc.
 */

/* ---------------------------------------------------------------- flashcards -- */

/** Per-student flashcard progress (Leitner-style box system). */
export function makeFlashcardProgress({ id, userId, flashcardId, chapterId,
  box = 0, isLearned = false, nextReviewAt = null,
  reviewCount = 0, correctCount = 0, lastReviewedAt = null } = {}) {
  return {
    id, userId, flashcardId, chapterId: chapterId || null,
    box, isLearned: isLearned ? 1 : 0,
    nextReviewAt, reviewCount, correctCount, lastReviewedAt,
  };
}

/* ------------------------------------------------------------ sessions ------ */

/** A flashcard study session. */
export function makeFlashcardSession({ id, userId, subjectId, chapterId,
  cardsStudied = 0, cardsMastered = 0, cardsNeedingPractice = 0,
  cardsMarkedReview = 0, startedAt = null, completedAt = null } = {}) {
  return {
    id, userId, subjectId, chapterId, cardsStudied, cardsMastered,
    cardsNeedingPractice, cardsMarkedReview,
    startedAt: startedAt || new Date().toISOString(),
    completedAt,
  };
}

/** A practice question session. */
export function makeQuestionSession({ id, userId, subjectId, chapterId,
  questionsAttempted = 0, correctAnswers = 0, incorrectAnswers = 0,
  unanswered = 0, markedReview = 0, accuracyPct = 0, timeSpentSec = 0,
  byDifficulty = { Easy: 0, Medium: 0, Hard: 0 },
  history = [], startedAt = null, completedAt = null } = {}) {
  return {
    id, userId, subjectId, chapterId, questionsAttempted, correctAnswers,
    incorrectAnswers, unanswered, markedReview, accuracyPct, timeSpentSec,
    byDifficulty, history,
    startedAt: startedAt || new Date().toISOString(), completedAt,
  };
}

/* ------------------------------------------------------------- constants --- */

export const DIFFICULTY_LEVELS = ["Easy", "Medium", "Hard"];

/** Map app difficulty label to internal value. */
export function normalizeDifficulty(value) {
  const v = String(value || "").trim();
  if (/easy/i.test(v)) return "Easy";
  if (/hard/i.test(v)) return "Hard";
  return "Medium";
}
