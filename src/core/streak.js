/**
 * streak.js — study-day streaks and the heatmap.
 *
 * A calendar day qualifies as a study day when either:
 *   - at least STREAK_MIN_MINUTES of saved study time was logged that day, or
 *   - at least STREAK_MIN_ITEMS checklist items were ticked that day.
 *
 * A timer that is still running never qualifies a day — only a saved session does.
 * The current streak is not broken by today being unfinished: it counts backwards
 * from today if today qualifies, otherwise from yesterday.
 *
 * Pure and DOM-free. `daysBetween` is passed in so the module shares the app's
 * date maths (and can be tested without a clock).
 */
import { STREAK_MIN_ITEMS, STREAK_MIN_MINUTES, STREAK_MILESTONES } from "./constants.js";
import { diffDays } from "./dates.js";

export function qualifiesForStreak(day) {
  return (day.studyMinutes || 0) >= STREAK_MIN_MINUTES || (day.itemsCompleted || 0) >= STREAK_MIN_ITEMS;
}

const addDays = (iso, n) => {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

export function computeStreaks(days, today) {
  const qualified = days.filter(qualifiesForStreak).map((d) => d.day).sort();
  const qualifiedSet = new Set(qualified);

  // longest run of consecutive qualified days
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of qualified) {
    run = previous && diffDays(previous, day) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = day;
  }

  // current run, walking back from today (or yesterday when today is unfinished)
  let anchor = null;
  if (qualifiedSet.has(today)) anchor = today;
  else if (qualifiedSet.has(addDays(today, -1))) anchor = addDays(today, -1);

  let current = 0;
  if (anchor) {
    let cursor = anchor;
    while (qualifiedSet.has(cursor)) { current += 1; cursor = addDays(cursor, -1); }
  }

  const lastStudyDay = qualified.length ? qualified[qualified.length - 1] : null;
  const milestonesReached = STREAK_MILESTONES.filter((m) => longest >= m);
  const nextMilestone = STREAK_MILESTONES.find((m) => current < m) ?? null;

  return {
    current,
    longest: Math.max(longest, current),
    activeDays: days.filter((d) => (d.studyMinutes || 0) > 0 || (d.itemsCompleted || 0) > 0).length,
    qualifiedDays: qualified.length,
    lastStudyDay,
    totalMinutes: days.reduce((acc, d) => acc + (d.studyMinutes || 0), 0),
    milestonesReached,
    nextMilestone,
    todayQualified: qualifiedSet.has(today),
  };
}

/** Progress toward the next streak milestone, 0–1. */
export function milestoneProgress(current, nextMilestone) {
  if (!nextMilestone) return 1;
  return Math.min(1, current / nextMilestone);
}

/** Heatmap intensity 0–4 for a day (see constants.HEATMAP_BUCKETS for the legend). */
export function heatmapLevel(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 20) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}

/**
 * Build a dense, per-day activity series for the last `spanDays` days (oldest first):
 * saved minutes per day and checklist items completed per day (from `doneAt`).
 * Missing days are filled with zeros so a heatmap can never misalign.
 */
export function buildDayActivity({ sessions, nodes, chapters, today, spanDays = 371 }) {
  const minutesByDay = new Map();
  for (const s of sessions) {
    if (!s.dateISO) continue;
    minutesByDay.set(s.dateISO, (minutesByDay.get(s.dateISO) || 0) + (Number(s.minutes) || 0));
  }
  const itemsByDay = new Map();
  const addItem = (rec) => {
    if (!rec?.doneAt) return;
    itemsByDay.set(rec.doneAt, (itemsByDay.get(rec.doneAt) || 0) + 1);
  };
  for (const n of nodes || []) addItem(n);
  for (const c of chapters || []) addItem(c);

  const days = [];
  const start = addDays(today, -(spanDays - 1));
  for (let i = 0; i < spanDays; i++) {
    const day = addDays(start, i);
    days.push({
      day,
      studyMinutes: minutesByDay.get(day) || 0,
      itemsCompleted: itemsByDay.get(day) || 0,
    });
  }
  return days;
}
