/**
 * flashcard-flow.js — state machine for a flashcard study session.
 *
 * Handles: card sequencing, flipping, self-assessment (Know it / Need practice /
 * Mark for review), progress tracking, and Leitner-style box progression.
 * Pure logic — no DOM, no framework. Can be unit-tested independently.
 */

import { makeFlashcardProgress, makeFlashcardSession } from "../data/models.js?v=mwz23oco";
import { upsertFlashcardProgress, saveFlashcardSession } from "../data/repository.js?v=mwz23oco";
import { currentUser } from "../../../core/supabase.js?v=mwz23oco";

const ACTIONS = { KNOW_IT: "knowIt", NEED_PRACTICE: "needPractice", MARK_REVIEW: "markReview" };

/** Create a new flashcard session state. */
export function createFlashcardState(cards, options = {}) {
  const userId = options.userId || currentUser()?.id || null;
  const shuffled = [...cards].sort(() => Math.random() - 0.5);
  return {
    userId,
    cards: shuffled,
    currentIndex: 0,
    isFlipped: false,
    sessionId: `fc_session_${Date.now()}`,
    startedAt: new Date().toISOString(),
    stats: {
      total: shuffled.length,
      studied: 0,
      mastered: 0,
      needingPractice: 0,
      markedReview: 0,
      byDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
      history: [], // { cardId, action, timestamp }
    },
  };
}

/** Get the current card. */
export function getCurrentCard(state) {
  if (state.currentIndex < 0 || state.currentIndex >= state.cards.length) return null;
  return state.cards[state.currentIndex];
}

/** Get progress percentage (0-100). */
export function getProgressPct(state) {
  if (state.stats.total === 0) return 0;
  return Math.round((state.currentIndex / state.stats.total) * 100);
}

/** Check if the session is complete. */
export function isComplete(state) {
  return state.currentIndex >= state.cards.length;
}

/** Flip the current card. */
export function flipCard(state) {
  return { ...state, isFlipped: !state.isFlipped };
}

/** Move to the next card. */
export function nextCard(state) {
  if (isComplete(state)) return state;
  return { ...state, currentIndex: state.currentIndex + 1, isFlipped: false };
}

/** Move to the previous card. */
export function prevCard(state) {
  if (state.currentIndex <= 0) return state;
  return { ...state, currentIndex: state.currentIndex - 1, isFlipped: false };
}

/**
 * Record a self-assessment action for the current card.
 * Updates stats and Leitner box progress.
 */
export async function assessCard(state, action, userId = currentUser()?.id || null) {
  const card = getCurrentCard(state);
  if (!card) return state;

  const now = new Date().toISOString();
  const updatedStats = { ...state.stats };
  updatedStats.studied += 1;

  // Determine box progression based on action
  let nextBox = 0;
  let nextReviewAt = null;
  let isLearned = false;

  switch (action) {
    case ACTIONS.KNOW_IT:
      updatedStats.mastered += 1;
      updatedStats.byDifficulty[card.difficulty] =
        (updatedStats.byDifficulty[card.difficulty] || 0) + 1;
      nextBox = 3; // mastered -> box 3
      isLearned = true;
      nextReviewAt = addDays(now, 7); // review in 7 days
      break;
    case ACTIONS.NEED_PRACTICE:
      updatedStats.needingPractice += 1;
      nextBox = 1; // needs practice -> box 1
      nextReviewAt = addDays(now, 1); // review tomorrow
      break;
    case ACTIONS.MARK_REVIEW:
      updatedStats.markedReview += 1;
      nextBox = 0; // marked for review -> box 0 (due now)
      nextReviewAt = now; // due immediately
      break;
  }

  updatedStats.history.push({
    cardId: card.id,
    action,
    timestamp: now,
  });

  // Save progress to Supabase
  const progress = makeFlashcardProgress({
    id: `fcprog_${userId}_${card.id}`,
    userId,
    flashcardId: card.id,
    chapterId: card.chapterId || null,
    box: nextBox,
    isLearned,
    nextReviewAt,
    reviewCount: 1,
    correctCount: action === ACTIONS.KNOW_IT ? 1 : 0,
    lastReviewedAt: now,
  });
  await upsertFlashcardProgress(progress);

  // Move to next card
  const nextState = nextCard(state);
  nextState.stats = updatedStats;
  return nextState;
}

/** Save a completed session summary. */
export async function saveSessionSummary(state, options = {}) {
  const userId = options.userId || currentUser()?.id || null;
  const session = makeFlashcardSession({
    id: state.sessionId,
    userId,
    subjectId: options.subjectId || null,
    chapterId: options.chapterId || null,
    cardsStudied: state.stats.studied,
    cardsMastered: state.stats.mastered,
    cardsNeedingPractice: state.stats.needingPractice,
    cardsMarkedReview: state.stats.markedReview,
    startedAt: state.startedAt,
    completedAt: new Date().toISOString(),
  });
  await saveFlashcardSession(session);
  return session;
}

/** Add days to an ISO date string. */
function addDays(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export { ACTIONS };
