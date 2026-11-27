/**
 * quests.js — short, self-set study goals that reset daily and weekly.
 *
 * Everything here is derived from records the student already produced: the points
 * ledger says which events happened on which day, `dayActivity` says how many minutes
 * were logged, and the study-day rule (from streak.js) says whether a day qualified.
 * Nothing is stored as its own state, so a corrected or deleted record moves the
 * quest with it — and a quest's XP can only ever be minted once per period.
 *
 * Pure and DOM-free, so it is unit-testable in plain Node.
 */
import { QUEST_XP, WEEK_QUEST_TARGETS, STREAK_MIN_MINUTES } from "./constants.js?v=mwz8hppl";
import { qualifiesForStreak } from "./streak.js?v=mwz8hppl";

const addDays = (iso, n) => {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** The Monday-starting week (as an ISO date) that contains `day`. */
export function weekStart(day) {
  if (!day) return null;
  const d = new Date(day + "T00:00:00Z");
  if (isNaN(d.getTime())) return null;
  const fromMonday = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - fromMonday);
  return d.toISOString().slice(0, 10);
}

/** ISO-ish week label: the Monday date, e.g. "2026-10-12". */
export const weekKey = (day) => weekStart(day);

/** The stable ledger id for a quest reward — unique per quest, per period. */
export const questDedupeKey = (quest) => `quest:${quest.scope}:${quest.id}:${quest.period}`;

/**
 * Build the daily and weekly quest boards.
 *
 * @param {object} input
 * @param {string} input.today            ISO date the daily board is generated for
 * @param {Array}  input.dayActivity      dense series from streak.buildDayActivity
 * @param {Array}  input.points           the immutable ledger (for dated event counts)
 * @param {number} input.dailyTargetMin   the student's own daily target, if set
 */
export function buildQuests({ today, dayActivity = [], points = [], dailyTargetMin = 0 }) {
  const byDay = new Map(dayActivity.map((d) => [d.day, d]));
  const minutesOn = (day) => byDay.get(day)?.studyMinutes || 0;
  const countOn = (day, kind) => points.filter((p) => p.kind === kind && p.day === day).length;

  const start = weekStart(today);
  const week = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const minutesThisWeek = week.reduce((a, d) => a + minutesOn(d), 0);
  const qualifiedThisWeek = week.filter((d) => qualifiesForStreak(byDay.get(d) || {})).length;
  const revisionsOn = (d) => countOn(d, "REVISION_PASS");
  const doubtsOn = (d) => countOn(d, "DOUBT_RESOLVED");

  const dailyDefs = [
    {
      id: "warmup", scope: "daily", icon: "⏱", title: `Log ${STREAK_MIN_MINUTES} minutes`,
      note: "A single short session is enough.",
      target: STREAK_MIN_MINUTES, progress: minutesOn(today), unit: "min", xp: QUEST_XP.DAILY_WARMUP,
    },
    {
      id: "items", scope: "daily", icon: "✓", title: "Tick 3 checklist items",
      note: "Chapters, topics or planner tasks.",
      target: 3, progress: countOn(today, "CHECKLIST_ITEM"), unit: "", xp: QUEST_XP.DAILY_ITEMS,
    },
    {
      id: "revision", scope: "daily", icon: "↻", title: "Finish a revision pass",
      note: "Uses your spaced-revision ladder.",
      target: 1, progress: revisionsOn(today), unit: "", xp: QUEST_XP.DAILY_REVISION,
    },
    {
      id: "doubt", scope: "daily", icon: "?", title: "Clear a doubt",
      note: "Mark an open doubt as resolved.",
      target: 1, progress: doubtsOn(today), unit: "", xp: QUEST_XP.DAILY_DOUBT,
    },
  ];
  if (dailyTargetMin > 0) {
    dailyDefs.push({
      id: "goal", scope: "daily", icon: "🎯", title: `Hit today's ${dailyTargetMin}-minute goal`,
      note: "Your own target, from Settings.",
      target: dailyTargetMin, progress: minutesOn(today), unit: "min", xp: QUEST_XP.DAILY_GOAL,
    });
  }

  const weeklyDefs = [
    {
      id: "days", scope: "weekly", icon: "🔥", title: `Study on ${WEEK_QUEST_TARGETS.days} days`,
      note: `A day counts after ${STREAK_MIN_MINUTES}+ minutes or 3 items.`,
      target: WEEK_QUEST_TARGETS.days, progress: qualifiedThisWeek, unit: "days", xp: QUEST_XP.WEEK_DAYS,
    },
    {
      id: "minutes", scope: "weekly", icon: "⚡", title: `Log ${WEEK_QUEST_TARGETS.minutes} minutes`,
      note: "Saved study time only.",
      target: WEEK_QUEST_TARGETS.minutes, progress: minutesThisWeek, unit: "min", xp: QUEST_XP.WEEK_MINUTES,
    },
    {
      id: "revisions", scope: "weekly", icon: "↻", title: `${WEEK_QUEST_TARGETS.revisions} revision passes`,
      note: "Across any subjects.",
      target: WEEK_QUEST_TARGETS.revisions, progress: week.reduce((a, d) => a + revisionsOn(d), 0), unit: "", xp: QUEST_XP.WEEK_REVISIONS,
    },
    {
      id: "doubts", scope: "weekly", icon: "✦", title: `Clear ${WEEK_QUEST_TARGETS.doubts} doubts`,
      note: "Keep the doubt list short.",
      target: WEEK_QUEST_TARGETS.doubts, progress: week.reduce((a, d) => a + doubtsOn(d), 0), unit: "", xp: QUEST_XP.WEEK_DOUBTS,
    },
  ];

  const decorate = (def, period) => {
    const progress = Math.max(0, Math.min(def.target, def.progress || 0));
    const quest = { ...def, period, progress, done: progress >= def.target };
    quest.pct = def.target > 0 ? Math.min(1, progress / def.target) : 0;
    quest.key = questDedupeKey(quest);
    quest.earned = points.some((p) => p.id === quest.key);
    return quest;
  };

  const daily = dailyDefs.map((d) => decorate(d, today));
  const weekly = weeklyDefs.map((d) => decorate(d, weekKey(today)));
  const all = [...daily, ...weekly];

  return {
    daily, weekly, all,
    day: today, week: { key: weekKey(today), start, days: week },
    doneCount: all.filter((q) => q.done).length,
    dailyDoneCount: daily.filter((q) => q.done).length,
    weeklyDoneCount: weekly.filter((q) => q.done).length,
    xpAvailable: all.filter((q) => !q.earned).reduce((a, q) => a + q.xp, 0),
    xpEarnedToday: daily.filter((q) => q.earned).reduce((a, q) => a + q.xp, 0),
  };
}
