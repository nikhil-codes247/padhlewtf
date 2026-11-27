/**
 * repository.js — data access layer for the Revision Centre feature.
 *
 * Everything lives in Supabase:
 *
 *   · `revision_flashcards` / `revision_questions` — the shared, read-only
 *     content catalogue. It is seeded once from `tools/data/revisionContent.js`
 *     with `npm run seed:supabase` (see DEPLOYMENT.md) and only read at runtime.
 *
 *   · `flashcard_progress`, `question_attempts`, `flashcard_sessions` and
 *     `question_sessions` — the signed-in student's own rows, protected by RLS.
 *
 * The repository keeps the app's camelCase model at the boundary and translates
 * to the snake_case columns PostgREST exposes, so views and flows stay
 * unchanged. No IndexedDB is used anywhere.
 */

import {
  selectRows, upsertRows, deleteRows, currentUser,
} from "../../../core/supabase.js?v=mwz8hppl";
import { config } from "../../../core/config.js?v=mwz8hppl";
import { normalizeDifficulty } from "./models.js?v=mwz8hppl";

/* --------------------------------------------------------------- helpers --- */

const enc = encodeURIComponent;

/** The signed-in student's id. */
function uid() {
  return currentUser()?.id || null;
}

function requireUid() {
  const id = uid();
  if (!id) throw new Error("Sign in to use the Revision Centre.");
  return id;
}

/* --------------------------------------------------------------- mapping --- */

function flashcardToApp(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    chapterId: r.chapter_id,
    chapterName: r.chapter_name,
    front: r.front,
    back: r.back,
    difficulty: r.difficulty,
    tags: Array.isArray(r.tags) ? r.tags : [],
    source: r.source,
    sourceYear: r.source_year,
    isActive: r.is_active ? 1 : 0,
    order: r.sort_order,
    createdAt: r.created_at,
  };
}

export function flashcardToDb(c) {
  return {
    id: c.id,
    subject_id: c.subjectId,
    chapter_id: c.chapterId || null,
    chapter_name: c.chapterName || null,
    front: c.front,
    back: c.back,
    difficulty: normalizeDifficulty(c.difficulty),
    tags: Array.isArray(c.tags) ? c.tags : [],
    source: c.source || null,
    source_year: c.sourceYear ?? null,
    is_active: c.isActive !== 0,
    sort_order: c.order || 0,
  };
}

function questionToApp(r) {
  return {
    id: r.id,
    subjectId: r.subject_id,
    chapterId: r.chapter_id,
    chapterName: r.chapter_name,
    type: r.type,
    marks: r.marks,
    difficulty: r.difficulty,
    prompt: r.prompt,
    answer: r.answer,
    explanation: r.explanation,
    options: Array.isArray(r.options) ? r.options : [],
    correctOptionIndex: r.correct_option_index,
    source: r.source,
    sourceYear: r.source_year,
    isActive: r.is_active ? 1 : 0,
    order: r.sort_order,
    createdAt: r.created_at,
  };
}

export function questionToDb(q) {
  return {
    id: q.id,
    subject_id: q.subjectId,
    chapter_id: q.chapterId || null,
    chapter_name: q.chapterName || null,
    type: q.type || "short",
    marks: Number(q.marks) || 1,
    difficulty: normalizeDifficulty(q.difficulty),
    prompt: q.prompt,
    answer: q.answer,
    explanation: q.explanation || null,
    options: Array.isArray(q.options) ? q.options : [],
    correct_option_index: q.correctOptionIndex ?? null,
    source: q.source || null,
    source_year: q.sourceYear ?? null,
    is_active: q.isActive !== 0,
    sort_order: q.order || 0,
  };
}

function progressToApp(r) {
  return {
    id: r.id,
    userId: r.user_id,
    flashcardId: r.flashcard_id,
    box: Number(r.box) || 0,
    isLearned: Boolean(r.is_learned),
    nextReviewAt: r.next_review_at,
    reviewCount: Number(r.review_count) || 0,
    correctCount: Number(r.correct_count) || 0,
    lastReviewedAt: r.last_reviewed_at,
  };
}

function attemptToApp(r) {
  const correct = r.is_correct === null || r.is_correct === undefined ? null : (r.is_correct ? 1 : 0);
  return {
    id: r.id,
    userId: r.user_id,
    questionId: r.question_id,
    selectedAnswer: r.selected_answer,
    isCorrect: correct,
    marksAwarded: r.marks_awarded,
    timeSpentSec: r.time_spent_sec,
    attemptedAt: r.attempted_at,
  };
}

function fcSessionToApp(r) {
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id,
    chapterId: r.chapter_id,
    cardsStudied: Number(r.cards_studied) || 0,
    cardsMastered: Number(r.cards_mastered) || 0,
    cardsNeedingPractice: Number(r.cards_needing_practice) || 0,
    cardsMarkedReview: Number(r.cards_marked_review) || 0,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

function qSessionToApp(r) {
  return {
    id: r.id,
    userId: r.user_id,
    subjectId: r.subject_id,
    chapterId: r.chapter_id,
    questionsAttempted: Number(r.questions_attempted) || 0,
    correctAnswers: Number(r.correct_answers) || 0,
    incorrectAnswers: Number(r.incorrect_answers) || 0,
    unanswered: Number(r.unanswered) || 0,
    markedReview: Number(r.marked_review) || 0,
    accuracyPct: Number(r.accuracy_pct) || 0,
    timeSpentSec: Number(r.time_spent_sec) || 0,
    byDifficulty: r.by_difficulty || { Easy: 0, Medium: 0, Hard: 0 },
    history: Array.isArray(r.history) ? r.history : [],
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}

/* --------------------------------------------------------------- content --- */

let contentChecked = false;

/**
 * The catalogue is seeded once by the deployment script. At runtime this only
 * confirms the tables are readable; it never writes shared content from a
 * student's browser.
 */
export async function ensureRevisionContent() {
  if (contentChecked) return { addedFlashcards: 0, addedQuestions: 0 };
  contentChecked = true;
  try {
    const rows = await selectRows("revision_flashcards", "select=id&limit=1");
    if ((!Array.isArray(rows) || rows.length === 0) && config.environment !== "test") {
      console.warn(
        "[revision] The flashcard catalogue is empty. Run `npm run seed:supabase` " +
        "with your service-role key to upload tools/data/revisionContent.js.",
      );
    }
  } catch (err) {
    console.warn("[revision] Could not read the content catalogue:", err?.message || err);
  }
  return { addedFlashcards: 0, addedQuestions: 0 };
}

/** Get all flashcards, optionally filtered by subject/chapter/difficulty. */
export async function listFlashcards({ subjectId, chapterId, difficulty, isActive = true } = {}) {
  const q = ["select=*"];
  if (isActive) q.push("is_active=eq.true");
  if (subjectId) q.push(`subject_id=eq.${enc(subjectId)}`);
  if (chapterId) q.push(`chapter_id=eq.${enc(chapterId)}`);
  if (difficulty) q.push(`difficulty=eq.${enc(difficulty)}`);
  q.push("order=sort_order.asc");
  const rows = await selectRows("revision_flashcards", q.join("&"));
  return (Array.isArray(rows) ? rows : []).map(flashcardToApp);
}

/** Get a single flashcard by id. */
export async function getFlashcard(id) {
  const rows = await selectRows("revision_flashcards", `select=*&id=eq.${enc(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? flashcardToApp(row) : null;
}

/** Save flashcards (bulk upsert). Used by the import/seed step. */
export async function saveFlashcards(flashcards) {
  if (!flashcards?.length) return [];
  const rows = await upsertRows("revision_flashcards", flashcards.map(flashcardToDb), "id");
  return (Array.isArray(rows) ? rows : []).map(flashcardToApp);
}

/* -------------------------------------------------------- flashcard progress -- */

/** Get progress for the signed-in student + a specific flashcard. */
export async function getFlashcardProgress(flashcardId) {
  const id = uid();
  if (!id) return null;
  const all = await listFlashcardProgress();
  const entry = all.find((p) => p.flashcardId === flashcardId);
  return entry || null;
}

/** Get all progress for the signed-in student.
 *
 * Phase 3: progress is stored as one JSON blob per chapter. This expands the
 * blobs into individual entries so the rest of the app keeps working unchanged.
 */
export async function listFlashcardProgress() {
  const id = uid();
  if (!id) return [];
  const rows = await selectRows("flashcard_progress", `user_id=eq.${encodeURIComponent(id)}`);
  const out = [];
  for (const row of rows || []) {
    const data = row.data || {};
    for (const [flashcardId, p] of Object.entries(data)) {
      out.push(progressToApp({
        id: `fcprog_${id}_${flashcardId}`,
        user_id: id,
        flashcard_id: flashcardId,
        ...p,
      }));
    }
  }
  return out;
}

/** Save flashcard progress.
 *
 * Phase 3: upserts into a per-chapter JSON blob instead of one row per card.
 * The progress object should include `chapterId`; if omitted, the card is
 * stored under an "uncategorized" chapter blob (backward-compatible fallback).
 */
export async function upsertFlashcardProgress(progress) {
  const userId = requireUid();
  const chapterId = progress.chapterId || "uncategorized";

  // Load the existing chapter blob.
  const rows = await selectRows(
    "flashcard_progress",
    `user_id=eq.${encodeURIComponent(userId)}&chapter_id=eq.${encodeURIComponent(chapterId)}`
  );
  const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};

  // Update the specific card's entry.
  const cardKey = progress.flashcardId;
  data[cardKey] = {
    box: Number(progress.box) || 0,
    is_learned: Boolean(progress.isLearned),
    next_review_at: progress.nextReviewAt || null,
    review_count: Number(progress.reviewCount) || 0,
    correct_count: Number(progress.correctCount) || 0,
    last_reviewed_at: progress.lastReviewedAt || null,
  };

  const row = {
    user_id: userId,
    chapter_id: chapterId,
    data,
    updated_at: new Date().toISOString(),
  };
  await upsertRows("flashcard_progress", [row], "user_id,chapter_id");

  const saved = data[cardKey];
  return progressToApp({
    id: `fcprog_${userId}_${progress.flashcardId}`,
    user_id: userId,
    flashcard_id: progress.flashcardId,
    ...saved,
  });
}

/* --------------------------------------------------------------- questions -- */

/** Get all questions, optionally filtered. */
export async function listQuestions({ subjectId, chapterId, type, difficulty, isActive = true } = {}) {
  const q = ["select=*"];
  if (isActive) q.push("is_active=eq.true");
  if (subjectId) q.push(`subject_id=eq.${enc(subjectId)}`);
  if (chapterId) q.push(`chapter_id=eq.${enc(chapterId)}`);
  if (type) q.push(`type=eq.${enc(type)}`);
  if (difficulty) q.push(`difficulty=eq.${enc(difficulty)}`);
  q.push("order=sort_order.asc");
  const rows = await selectRows("revision_questions", q.join("&"));
  return (Array.isArray(rows) ? rows : []).map(questionToApp);
}

/** Get a single question by id. */
export async function getQuestion(id) {
  const rows = await selectRows("revision_questions", `select=*&id=eq.${enc(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? questionToApp(row) : null;
}

/** Save questions (bulk upsert). Used by the import/seed step. */
export async function saveQuestions(questions) {
  if (!questions?.length) return [];
  const rows = await upsertRows("revision_questions", questions.map(questionToDb), "id");
  return (Array.isArray(rows) ? rows : []).map(questionToApp);
}

/* ---------------------------------------------------------- question attempts -- */

/** Save a question attempt.
 *
 * Phase 3 extension: upserts into a per-chapter JSON blob instead of one row
 * per attempt. The attempt object must include `chapterId` so we know which
 * blob to write to.
 */
export async function saveQuestionAttempt(attempt) {
  const userId = requireUid();
  const chapterId = attempt.chapterId || "uncategorized";

  // Load the existing chapter blob.
  const rows = await selectRows(
    "question_attempts",
    `user_id=eq.${encodeURIComponent(userId)}&chapter_id=eq.${encodeURIComponent(chapterId)}`
  );
  const data = (Array.isArray(rows) && rows[0] && rows[0].data) || {};

  // Update the specific question's entry.
  const questionKey = attempt.questionId;
  data[questionKey] = {
    selected_answer: attempt.selectedAnswer ?? null,
    is_correct: attempt.isCorrect === null || attempt.isCorrect === undefined ? null : Boolean(attempt.isCorrect),
    marks_awarded: attempt.marksAwarded ?? null,
    time_spent_sec: attempt.timeSpentSec ?? null,
    attempted_at: attempt.attemptedAt || new Date().toISOString(),
  };

  const row = {
    user_id: userId,
    chapter_id: chapterId,
    data,
  };
  await upsertRows("question_attempts", [row], "user_id,chapter_id");

  const saved = data[questionKey];
  return attemptToApp({
    id: `qattempt_${userId}_${attempt.questionId}`,
    user_id: userId,
    question_id: attempt.questionId,
    ...saved,
  });
}

/** Get all attempts for the signed-in student.
 *
 * Phase 3 extension: expands the per-chapter JSON blobs back into individual
 * attempt records so the rest of the app keeps working unchanged.
 */
export async function listQuestionAttempts() {
  const id = uid();
  if (!id) return [];
  const rows = await selectRows("question_attempts", `user_id=eq.${enc(id)}`);
  const out = [];
  for (const row of rows || []) {
    const data = row.data || {};
    for (const [questionId, a] of Object.entries(data)) {
      out.push(attemptToApp({
        id: `qattempt_${id}_${questionId}`,
        user_id: id,
        question_id: questionId,
        ...a,
      }));
    }
  }
  return out;
}

/** Get attempt stats for the signed-in student. */
export async function getQuestionAttemptStats() {
  const rows = await listQuestionAttempts();
  const total = rows.length;
  const correct = rows.filter((a) => a.isCorrect === 1).length;
  const incorrect = rows.filter((a) => a.isCorrect === 0).length;
  const unanswered = rows.filter((a) => a.isCorrect === null).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
  return { total, correct, incorrect, unanswered, accuracy };
}

/* ------------------------------------------------------------- sessions ------ */

/** Save a flashcard session summary. */
export async function saveFlashcardSession(session) {
  const userId = requireUid();
  const row = {
    id: `fc_session_${userId}_${Date.now()}`,
    user_id: userId,
    subject_id: session.subjectId || null,
    chapter_id: session.chapterId || null,
    cards_studied: Number(session.cardsStudied) || 0,
    cards_mastered: Number(session.cardsMastered) || 0,
    cards_needing_practice: Number(session.cardsNeedingPractice) || 0,
    cards_marked_review: Number(session.cardsMarkedReview) || 0,
    started_at: session.startedAt || new Date().toISOString(),
    completed_at: session.completedAt || null,
  };
  const saved = await upsertRows("flashcard_sessions", [row], "user_id,id");
  const out = Array.isArray(saved) ? saved[0] : null;
  return out ? fcSessionToApp(out) : fcSessionToApp(row);
}

/** Get all flashcard sessions for the signed-in student. */
export async function listFlashcardSessions() {
  const id = uid();
  if (!id) return [];
  const rows = await selectRows("flashcard_sessions", `select=*&user_id=eq.${enc(id)}&order=started_at.asc`);
  return (Array.isArray(rows) ? rows : []).map(fcSessionToApp);
}

/** Save a question session summary. */
export async function saveQuestionSession(session) {
  const userId = requireUid();
  const row = {
    id: `q_session_${userId}_${Date.now()}`,
    user_id: userId,
    subject_id: session.subjectId || null,
    chapter_id: session.chapterId || null,
    questions_attempted: Number(session.questionsAttempted) || 0,
    correct_answers: Number(session.correctAnswers) || 0,
    incorrect_answers: Number(session.incorrectAnswers) || 0,
    unanswered: Number(session.unanswered) || 0,
    marked_review: Number(session.markedReview) || 0,
    accuracy_pct: Number(session.accuracyPct) || 0,
    time_spent_sec: Number(session.timeSpentSec) || 0,
    by_difficulty: session.byDifficulty || { Easy: 0, Medium: 0, Hard: 0 },
    history: Array.isArray(session.history) ? session.history : [],
    started_at: session.startedAt || new Date().toISOString(),
    completed_at: session.completedAt || null,
  };
  const saved = await upsertRows("question_sessions", [row], "user_id,id");
  const out = Array.isArray(saved) ? saved[0] : null;
  return out ? qSessionToApp(out) : qSessionToApp(row);
}

/** Get all question sessions for the signed-in student. */
export async function listQuestionSessions() {
  const id = uid();
  if (!id) return [];
  const rows = await selectRows("question_sessions", `select=*&user_id=eq.${enc(id)}&order=started_at.asc`);
  return (Array.isArray(rows) ? rows : []).map(qSessionToApp);
}

/* --------------------------------------------------------------- utilities --- */

/** Clear the signed-in student's revision data (progress, attempts, sessions). */
export async function clearRevisionCentreData() {
  const id = uid();
  if (!id) return;
  const filter = `user_id=eq.${enc(id)}`;
  await Promise.all([
    deleteRows("flashcard_progress", filter),
    deleteRows("question_attempts", filter),
    deleteRows("flashcard_sessions", filter),
    deleteRows("question_sessions", filter),
  ]);
}

/** Total flashcards available. */
export async function flashcardCount() {
  const rows = await selectRows("revision_flashcards", "select=id&is_active=eq.true");
  return Array.isArray(rows) ? rows.length : 0;
}

/** Total questions available. */
export async function questionCount() {
  const rows = await selectRows("revision_questions", "select=id&is_active=eq.true");
  return Array.isArray(rows) ? rows.length : 0;
}
