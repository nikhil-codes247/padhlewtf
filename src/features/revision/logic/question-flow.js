/**
 * question-flow.js — state machine for a practice question session.
 *
 * One question at a time. Selecting an option is the graded action: it records
 * whether the answer was correct, persists the attempt, and updates the session
 * score. Know-it / need-practice / mark-review are self-rating "mastery" tags
 * stored on the answer without double-counting the score.
 *
 * Pure logic — no DOM, no framework. Can be unit-tested independently.
 */

import { makeQuestionSession } from "../data/models.js?v=mwz7i9p1";
import { saveQuestionSession } from "../data/repository.js?v=mwz7i9p1";
import { currentUser } from "../../../core/supabase.js?v=mwz7i9p1";

/** Create a new question session state. */
export function createQuestionState(questions, options = {}) {
  const userId = options.userId || currentUser()?.id || null;
  const shuffled = [...questions].sort(() => Math.random() - 0.5);

  // Shuffle MCQ options but preserve correct-answer mapping
  const questionsWithShuffledOptions = shuffled.map((q, idx) => {
    if (q.type === "MCQ" && q.options && q.options.length > 1) {
      const paired = q.options.map((opt, optIdx) => ({
        text: opt,
        originalIndex: optIdx,
        isCorrect: q.correctOptionIndex !== null && q.correctOptionIndex === optIdx,
      }));
      paired.sort(() => Math.random() - 0.5);
      const newCorrectIndex = paired.findIndex((p) => p.isCorrect);
      return {
        ...q,
        questionNumber: idx + 1,
        options: paired.map((p) => p.text),
        correctOptionIndex: newCorrectIndex,
        _shuffledMap: paired.map((p) => p.originalIndex),
      };
    }
    return { ...q, questionNumber: idx + 1 };
  });

  return {
    userId,
    questions: questionsWithShuffledOptions,
    currentIndex: 0,
    sessionId: `q_session_${Date.now()}`,
    startedAt: new Date().toISOString(),
    answers: {}, // questionIndex -> { selectedAnswer, isCorrect, mastery, timeSpent, revealed, answeredAt }
    stats: {
      total: shuffled.length,
      attempted: 0,
      correct: 0,
      incorrect: 0,
      markedReview: 0,
      unanswered: shuffled.length,
      accuracy: 0,
      timeSpent: 0,
      byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
      history: [], // { questionId, action, isCorrect, timestamp }
    },
  };
}

/** Get the current question. */
export function getCurrentQuestion(state) {
  if (state.currentIndex < 0 || state.currentIndex >= state.questions.length) return null;
  return state.questions[state.currentIndex];
}

/** Get progress percentage (0-100). */
export function getProgressPct(state) {
  if (state.stats.total === 0) return 0;
  return Math.round((state.currentIndex / state.stats.total) * 100);
}

/** Check if session is complete. */
export function isComplete(state) {
  return state.currentIndex >= state.questions.length;
}

/** Get the student's answer for the current question (if any). */
export function getCurrentAnswer(state) {
  return state.answers[state.currentIndex] || null;
}

/** Self-rating mastery tag for the current answer. Also records correctness
 *  so the end-of-session results reflect the student's self-assessment. */
export function recordMastery(state, mastery) {
  const question = getCurrentQuestion(state);
  if (!question) return state;
  const previous = state.answers[state.currentIndex] || { selectedAnswer: null, isCorrect: null };
  let isCorrect = previous.isCorrect;
  if (mastery === "knowIt") isCorrect = 1;
  else if (mastery === "needPractice") isCorrect = 0;
  else if (mastery === "markReview") isCorrect = null;
  const updatedAnswers = { ...state.answers };
  updatedAnswers[state.currentIndex] = { ...previous, mastery, isCorrect };
  return { ...state, answers: updatedAnswers };
}

/** Reveal the answer + explanation for the current question. */
export function revealAnswer(state) {
  const question = getCurrentQuestion(state);
  if (!question) return state;
  const previous = state.answers[state.currentIndex] || { selectedAnswer: null, isCorrect: null, revealed: false };
  const updatedAnswers = { ...state.answers };
  updatedAnswers[state.currentIndex] = { ...previous, revealed: true };
  return { ...state, answers: updatedAnswers };
}

/** Move to the next question. Preserves the student's answer. */
export function nextQuestion(state) {
  if (isComplete(state)) return state;
  return { ...state, currentIndex: state.currentIndex + 1 };
}

/** Mark the current question as skipped (not attempted). */
export function skipQuestion(state) {
  const question = getCurrentQuestion(state);
  if (!question) return state;
  const updatedAnswers = { ...state.answers };
  updatedAnswers[state.currentIndex] = {
    selectedAnswer: null,
    isCorrect: null,
    mastery: null,
    timeSpent: 0,
    revealed: false,
    skipped: true,
    answeredAt: new Date().toISOString(),
  };
  const updatedStats = { ...state.stats };
  const wasAnswered = state.answers[state.currentIndex] !== undefined;
  if (!wasAnswered) {
    // Still count as attempted but unanswered
    updatedStats.attempted += 1;
    updatedStats.unanswered = Math.max(0, updatedStats.unanswered - 1);
  }
  return { ...state, answers: updatedAnswers, stats: updatedStats, currentIndex: state.currentIndex + 1 };
}

/** Move to the previous question. Preserves the student's answer. */
export function prevQuestion(state) {
  if (state.currentIndex <= 0) return state;
  return { ...state, currentIndex: state.currentIndex - 1 };
}

/**
 * Add the time spent on the current question to the session total.
 * The view measures the wall-clock time per question; this records it so the
 * session summary that is saved carries a real duration.
 */
export function recordTimeSpent(state, seconds) {
  return {
    ...state,
    stats: { ...state.stats, timeSpent: state.stats.timeSpent + seconds },
  };
}

/** Get results summary for end-of-session review. */
export function getResults(state) {
  const questions = state.questions;
  const questionResults = questions.map((q, idx) => {
    const answer = state.answers[idx];
    return {
      question: q,
      questionNumber: idx + 1,
      answer,
      isCorrect: answer?.isCorrect === 1,
      isIncorrect: answer?.isCorrect === 0,
      isUnanswered: !answer || answer.isCorrect === null,
      revealed: answer?.revealed || false,
      mastery: answer?.mastery ?? null,
      selectedAnswer: answer?.selectedAnswer ?? null,
      correctAnswer: q.type === "MCQ" && q.correctOptionIndex !== null
        ? q.options[q.correctOptionIndex]
        : q.answer,
      explanation: q.explanation,
      chapterName: q.chapterName,
    };
  });

  const total = questionResults.length;
  const correct = questionResults.filter((r) => r.isCorrect).length;
  const incorrect = questionResults.filter((r) => r.isIncorrect).length;
  const unanswered = questionResults.filter((r) => r.isUnanswered).length;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;

  const byDifficulty = {};
  const byChapter = {};
  for (const r of questionResults) {
    const d = r.question.difficulty;
    if (!byDifficulty[d]) byDifficulty[d] = { total: 0, correct: 0 };
    byDifficulty[d].total += 1;
    if (r.isCorrect) byDifficulty[d].correct += 1;

    const c = r.chapterName || "Unknown chapter";
    if (!byChapter[c]) byChapter[c] = { total: 0, correct: 0 };
    byChapter[c].total += 1;
    if (r.isCorrect) byChapter[c].correct += 1;
  }

  return {
    total,
    correct,
    incorrect,
    unanswered,
    markedReview: state.stats.markedReview,
    accuracy,
    timeSpent: state.stats.timeSpent,
    questionResults,
    byDifficulty,
    byChapter,
  };
}

/** Save a completed session summary. */
export async function saveSessionSummary(state, options = {}) {
  const userId = options.userId || currentUser()?.id || null;
  const results = getResults(state);

  const session = makeQuestionSession({
    id: state.sessionId,
    userId,
    subjectId: options.subjectId || null,
    chapterId: options.chapterId || null,
    questionsAttempted: results.total,
    correctAnswers: results.correct,
    incorrectAnswers: results.incorrect,
    unanswered: results.unanswered,
    markedReview: state.stats.markedReview,
    accuracyPct: results.accuracy,
    timeSpentSec: state.stats.timeSpent,
    byDifficulty: state.stats.byDifficulty,
    history: state.stats.history,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
  });
  await saveQuestionSession(session);
  return session;
}
