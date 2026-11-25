/**
 * revisionStats.js — turn the Phase-3 compact revision blobs into plain numbers.
 *
 * `flashcard_progress` and `question_attempts` each store **one JSON blob per
 * chapter** (`data` keyed by flashcard/question id). Everything that wants
 * card-level or attempt-level analytics has to expand those blobs first; doing
 * it in one place keeps the share card and the analytics page in agreement.
 *
 * Pure and DOM-free so it can be unit-tested without a browser.
 */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const truthy = (v) => v === true || v === 1 || v === "1";

/** Expand `{ chapterId, data: { id: entry } }` rows into flat records. */
export function expandBlobRows(rows = []) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    if (row.data && typeof row.data === "object" && !Array.isArray(row.data)) {
      for (const [key, entry] of Object.entries(row.data)) {
        out.push({ id: key, chapterId: row.chapterId ?? row.chapter_id ?? null, ...(entry || {}) });
      }
    } else {
      out.push(row);
    }
  }
  return out;
}

const dayOf = (value) => {
  const s = String(value || "");
  return s.length >= 10 ? s.slice(0, 10) : "";
};

/**
 * Flashcard totals.
 *
 * `reviewed` counts distinct cards that have ever been reviewed; `reviews` is
 * the lifetime number of reviews recorded across those cards. Accuracy is
 * correct answers ÷ reviews (the only retention signal the blob stores).
 */
export function summariseFlashcards(rows = [], { now = new Date().toISOString(), since = null } = {}) {
  const entries = expandBlobRows(rows);
  let reviewed = 0, reviews = 0, correct = 0, mastered = 0, due = 0;
  const byDate = {};
  const byChapter = {};

  for (const p of entries) {
    const reviewCount = num(p.review_count ?? p.reviewCount);
    const correctCount = num(p.correct_count ?? p.correctCount);
    const learned = truthy(p.is_learned ?? p.isLearned);
    const last = p.last_reviewed_at ?? p.lastReviewedAt ?? null;
    const next = p.next_review_at ?? p.nextReviewAt ?? null;
    const chapterId = p.chapterId ?? p.chapter_id ?? null;

    if (reviewCount > 0 || last) reviewed += 1;
    reviews += reviewCount;
    correct += correctCount;
    if (learned) mastered += 1;
    if (!next || String(next) <= now) due += 1;

    const day = dayOf(last);
    if (day && (!since || day >= since)) byDate[day] = (byDate[day] || 0) + 1;

    if (chapterId) {
      const bucket = byChapter[chapterId] || (byChapter[chapterId] = { reviewed: 0, reviews: 0, correct: 0, mastered: 0 });
      if (reviewCount > 0 || last) bucket.reviewed += 1;
      bucket.reviews += reviewCount;
      bucket.correct += correctCount;
      if (learned) bucket.mastered += 1;
    }
  }

  return {
    entries,
    reviewed,
    reviews,
    correct,
    mastered,
    due,
    accuracy: reviews ? Math.round((correct / reviews) * 100) : 0,
    mastery: reviewed ? Math.round((mastered / reviewed) * 100) : 0,
    byDate,
    byChapter,
  };
}

/**
 * Question-attempt totals.
 *
 * The blob keeps the latest attempt per question, so `attempted` means distinct
 * questions answered. `unanswered` covers "marked for review" attempts where
 * correctness was deliberately left unknown.
 */
export function summariseQuestions(rows = [], { since = null } = {}) {
  const entries = expandBlobRows(rows);
  let attempted = 0, correct = 0, incorrect = 0, unanswered = 0;
  let timeSpentSec = 0;
  const byDate = {};
  const byChapter = {};

  for (const a of entries) {
    const value = a.is_correct ?? a.isCorrect;
    const day = dayOf(a.attempted_at ?? a.attemptedAt);
    const chapterId = a.chapterId ?? a.chapter_id ?? null;
    const seconds = num(a.time_spent_sec ?? a.timeSpentSec);

    attempted += 1;
    if (truthy(value)) correct += 1;
    else if (value === false || value === 0 || value === "0") incorrect += 1;
    else unanswered += 1;
    timeSpentSec += seconds;

    if (day && (!since || day >= since)) byDate[day] = (byDate[day] || 0) + 1;

    if (chapterId) {
      const bucket = byChapter[chapterId] || (byChapter[chapterId] = { attempted: 0, correct: 0, incorrect: 0, unanswered: 0 });
      bucket.attempted += 1;
      if (truthy(value)) bucket.correct += 1;
      else if (value === false || value === 0 || value === "0") bucket.incorrect += 1;
      else bucket.unanswered += 1;
    }
  }

  return {
    entries,
    attempted,
    correct,
    incorrect,
    unanswered,
    timeSpentSec,
    accuracy: attempted ? Math.round((correct / attempted) * 100) : 0,
    byDate,
    byChapter,
  };
}
