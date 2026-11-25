/**
 * constants.js — the tunable product rules, in one place.
 *
 * These are the same decisions web/ made (the points table, the streak rule, the
 * heatmap buckets, the 250-point level curve) so a number can never disagree with
 * itself between features. If a number is here it is a decision, not an accident.
 */

/* --------------------------------------------------------------- study rules - */

/** Below this many minutes a session earns no points (kills refresh-spam). */
export const MIN_POINTS_SESSION_MINUTES = 10;

/**
 * STREAK RULE (stated in the UI): a calendar day counts as a study day when you log
 * at least STREAK_MIN_MINUTES of saved study time OR complete at least
 * STREAK_MIN_ITEMS checklist items that day. A running timer never counts.
 */
export const STREAK_MIN_MINUTES = 20;
export const STREAK_MIN_ITEMS = 3;

/** Milestones shown on the profile. */
export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/* --------------------------------------------------------------- points ------ */

/** Modest, transparent, published in the UI. Every award is deduped by a stable key. */
export const POINTS = {
  STUDY_SESSION: { points: 5, label: "Studied a session of 10+ minutes" },
  CHECKLIST_ITEM: { points: 2, label: "Checked off a checklist item" },
  REVISION_PASS: { points: 8, label: "Finished a revision pass" },
  DOUBT_RESOLVED: { points: 3, label: "Cleared a doubt" },
  DAILY_GOAL: { points: 15, label: "Hit your daily study target" },
};

/** Anti-abuse cap: at most this many checklist-item awards per calendar day. */
export const DAILY_CHECKLIST_POINT_CAP = 20;

/* ---------------------------------------------------------------- quests ---- */

/**
 * Study quests: a handful of short goals that reset every day and every week. Their
 * XP is minted through the same deduped ledger as every other award, so a quest can
 * only ever pay out once per period — never once per page visit.
 */
export const QUEST_XP = {
  DAILY_WARMUP: 5,
  DAILY_ITEMS: 5,
  DAILY_REVISION: 8,
  DAILY_DOUBT: 3,
  DAILY_GOAL: 15,
  WEEK_DAYS: 20,
  WEEK_MINUTES: 20,
  WEEK_REVISIONS: 15,
  WEEK_DOUBTS: 10,
};

/** Weekly quest targets (the daily ones track the settings and the study rules). */
export const WEEK_QUEST_TARGETS = { days: 5, minutes: 300, revisions: 3, doubts: 2 };

/** Levelling curve: level 1 at 0 points, +1 level every LEVEL_STEP points. */
export const LEVEL_STEP = 250;

/* --------------------------------------------------------------- heatmap ----- */

/** Heatmap intensity buckets by minutes studied, per the profile legend. */
export const HEATMAP_BUCKETS = [
  { min: 1, label: "1–19m" },
  { min: 20, label: "20–59m" },
  { min: 60, label: "1–2h" },
  { min: 120, label: "2h+" },
];

/** Revision ladder: +1 / +3 / +7 / +21 / +45 days between consecutive passes. */
export const REVISION_LADDER_DAYS = [1, 3, 7, 21, 45];

export const FREQUENCY_LABEL = {
  high: "High",
  medium: "Medium",
  low: "Low",
  rare: "Rare",
  unknown: "Not recorded",
};
