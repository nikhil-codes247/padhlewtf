/**
 * gamification.js — points, levels and the anti-abuse rules.
 *
 * POINTS RULES (deliberately modest, fully published in the UI)
 * ------------------------------------------------------------
 *   STUDY_SESSION   5   a saved session of >= 10 minutes
 *   CHECKLIST_ITEM  2   ticking a checklist item (max 10 awards/day)
 *   REVISION_PASS   8   completing a scheduled revision pass
 *   DOUBT_RESOLVED  3   marking a doubt resolved
 *   DAILY_GOAL     15   hitting the daily study target (once per day)
 *   QUEST        5–20   finishing a daily or weekly study quest (once per period)
 *
 * XP and levels use the same currency: the level curve simply reads the total.
 *
 * Nothing is ever awarded for opening a page or refreshing: an award is only minted
 * by a state change the student caused, and each carries a stable dedupeKey so the
 * same award can never be minted twice (a double-click or a replayed import cannot
 * inflate a total). Pure and DOM-free so it can be unit-tested in plain Node.
 */
import { DAILY_CHECKLIST_POINT_CAP, MIN_POINTS_SESSION_MINUTES, POINTS, LEVEL_STEP } from "./constants.js?v=mwz6nuk5";

export const POINT_RULES = [
  { kind: "STUDY_SESSION", points: POINTS.STUDY_SESSION.points, label: POINTS.STUDY_SESSION.label, dedupe: "one award per saved session" },
  { kind: "CHECKLIST_ITEM", points: POINTS.CHECKLIST_ITEM.points, label: POINTS.CHECKLIST_ITEM.label, dedupe: "one award per item, capped at 10 items/day" },
  { kind: "REVISION_PASS", points: POINTS.REVISION_PASS.points, label: POINTS.REVISION_PASS.label, dedupe: "one award per revision pass" },
  { kind: "DOUBT_RESOLVED", points: POINTS.DOUBT_RESOLVED.points, label: POINTS.DOUBT_RESOLVED.label, dedupe: "one award per doubt" },
  { kind: "DAILY_GOAL", points: POINTS.DAILY_GOAL.points, label: POINTS.DAILY_GOAL.label, dedupe: "once per calendar day" },
  { kind: "QUEST", points: "5–20", label: "Completing a study quest", dedupe: "once per quest, per day or week" },
];

/* ---------------------------------------------------------- dedupe keys ------ */

export const sessionDedupeKey = (sessionId) => `session:${sessionId}`;
export const itemDedupeKey = (itemId) => `item:${itemId}`;
export const revisionDedupeKey = (taskId, passNumber) => `revision:${taskId}:${passNumber}`;
export const doubtDedupeKey = (noteId) => `doubt:${noteId}`;
export const dailyGoalDedupeKey = (day) => `day:${day}`;

/* ---------------------------------------------------------- award maths ------ */

/** A session earns points only past the minimum meaningful duration. */
export function pointsForSession(durationMinutes) {
  return durationMinutes >= MIN_POINTS_SESSION_MINUTES ? POINTS.STUDY_SESSION.points : 0;
}

/** How many checklist awards may still be granted today (uncapped by undo). */
export function remainingChecklistAwards(alreadyAwardedToday) {
  const perItem = POINTS.CHECKLIST_ITEM.points;
  const maxAwards = Math.floor(DAILY_CHECKLIST_POINT_CAP / perItem);
  return Math.max(0, maxAwards - alreadyAwardedToday);
}

export function shouldAwardDailyGoal(studyMinutesToday, dailyTargetMinutes, alreadyAwarded) {
  if (alreadyAwarded) return false;
  if (dailyTargetMinutes <= 0) return false;
  return studyMinutesToday >= dailyTargetMinutes;
}

export function totalPoints(events) {
  return events.reduce((acc, e) => acc + (Number(e.points) || 0), 0);
}

/** Points earned per calendar day, keyed by YYYY-MM-DD (from stored `day`). */
export function pointsByDay(events) {
  const out = {};
  for (const e of events) out[e.day] = (out[e.day] || 0) + (Number(e.points) || 0);
  return out;
}

/* ---------------------------------------------------------- level curve ------ */

const LEVEL_TITLES = [
  "Rookie",
  "Getting going",
  "Steady",
  "Consistent",
  "Grinder",
  "Sharp",
  "Marathoner",
  "Board-ready",
];

export function levelForPoints(points) {
  const level = Math.floor(Math.max(0, points) / LEVEL_STEP) + 1;
  const intoLevel = Math.max(0, points) % LEVEL_STEP;
  return {
    level,
    intoLevel,
    needed: LEVEL_STEP,
    title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
  };
}

/** Plain-language restatement of the points table, rendered verbatim in the UI. */
export const POINT_RULES_TEXT = POINT_RULES.map((rule) => ({
  event: rule.kind,
  label: rule.label,
  rule: `${rule.points} point${rule.points === 1 ? "" : "s"} · ${rule.dedupe}.`,
}));
