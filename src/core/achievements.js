/**
 * achievements.js — 15 badges, all derived from records the student already created.
 *
 * There is no "claim" button, no randomised drop and no badge unlockable by opening
 * a page: every stat is a count read from the database, so the badge and the number
 * behind it can never disagree. Because they are derived, they are also self-healing
 * — correcting or deleting a record updates the badge on the next recompute.
 */

export const ACHIEVEMENTS = [
  { key: "first-session", title: "First step", description: "Save your first study session.", icon: "▶", metric: "sessions", target: 1, tone: "info" },
  { key: "first-hour", title: "An hour in", description: "Log one hour of saved study time.", icon: "◷", metric: "minutes", target: 60, tone: "ok" },
  { key: "ten-hours", title: "Ten hours deep", description: "Log ten hours of saved study time.", icon: "⚡", metric: "minutes", target: 600, tone: "accent" },
  { key: "fifty-hours", title: "Fifty hours", description: "Log fifty hours of saved study time.", icon: "🚀", metric: "minutes", target: 3000, tone: "bad" },
  { key: "streak-3", title: "Three in a row", description: "Reach a three-day study streak.", icon: "🔥", metric: "longestStreak", target: 3, tone: "bad" },
  { key: "streak-7", title: "Week warrior", description: "Reach a seven-day study streak.", icon: "🔥", metric: "longestStreak", target: 7, tone: "warn" },
  { key: "streak-30", title: "Thirty days", description: "Reach a thirty-day study streak.", icon: "♛", metric: "longestStreak", target: 30, tone: "accent" },
  { key: "active-50", title: "Half a hundred", description: "Study on fifty different days.", icon: "▦", metric: "activeDays", target: 50, tone: "ok" },
  { key: "checklist-25", title: "Ticked 25", description: "Complete twenty-five checklist items.", icon: "✓", metric: "checklistItems", target: 25, tone: "ok" },
  { key: "checklist-100", title: "Ticked 100", description: "Complete one hundred checklist items.", icon: "★", metric: "checklistItems", target: 100, tone: "warn" },
  { key: "revision-10", title: "Revision regular", description: "Finish ten revision passes.", icon: "↻", metric: "revisions", target: 10, tone: "info" },
  { key: "doubts-10", title: "Doubt clearer", description: "Resolve ten doubts.", icon: "✎", metric: "doubtsResolved", target: 10, tone: "accent" },
  { key: "points-500", title: "Five hundred", description: "Earn 500 points from real activity.", icon: "◈", metric: "points", target: 500, tone: "accent" },
  { key: "points-2000", title: "Two thousand", description: "Earn 2,000 points from real activity.", icon: "🏆", metric: "points", target: 2000, tone: "warn" },
  { key: "level-5", title: "Level five", description: "Reach level 5.", icon: "✦", metric: "level", target: 5, tone: "accent" },
];

function evaluateAchievement(def, stats) {
  const value = Math.max(0, Number(stats[def.metric]) || 0);
  const ratio = def.target > 0 ? value / def.target : 1;
  return { ...def, value, reached: value >= def.target, progress: Math.max(0, Math.min(1, ratio)) };
}

export function evaluateAchievements(stats) {
  return ACHIEVEMENTS.map((def) => evaluateAchievement(def, stats));
}

export function unlockedKeys(stats) {
  return evaluateAchievements(stats).filter((a) => a.reached).map((a) => a.key);
}

/** The next few badges worth aiming at: nearest first, so the UI nudges, not dumps. */
export function nextAchievements(stats, limit = 3) {
  return evaluateAchievements(stats)
    .filter((a) => !a.reached)
    .sort((a, b) => b.progress - a.progress)
    .slice(0, limit);
}
