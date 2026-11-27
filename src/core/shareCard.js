/**
 * shareCard.js — the share-card model.
 *
 * The model is the *only* thing the renderer is allowed to draw, and it is
 * restricted to the same facts a public share link can expose: streak, study
 * time, revision activity, points/level, overall progress and a decorative
 * activity strip. It can never contain a note, a doubt, a planner task, a
 * deadline, a session note or an email address, because those fields simply do
 * not exist on this type.
 *
 * Pure and DOM-free so it can be unit-tested without a canvas.
 *
 * Every card now carries the same eight-stat snapshot (time, sessions, streak,
 * best streak, flashcards, questions, accuracy, overall progress) so a shared
 * card always shows meaningful work rather than a single number. The `kind`
 * only changes the headline, accent and caption.
 */
import { STREAK_MILESTONES } from "./constants.js?v=mwz1qwqk";

export const SHARE_CARD_KIND_LABEL = {
  SNAPSHOT: "Full snapshot",
  STREAK: "Study streak",
  MILESTONE: "Streak milestone",
  WEEKLY: "This week",
  TOTAL_TIME: "Total study time",
  POINTS: "Points & level",
};

const ACCENT = {
  violet: "#ad8cff", amber: "#ffc94d", pink: "#ff7ab8", cyan: "#5ad9ee",
  lime: "#b6f04a", coral: "#ff6b5a", blue: "#5b83ff", mint: "#6fe3b0",
};

const dayWord = (n) => (n === 1 ? "day" : "days");

/** Whole hours, one decimal only when it adds information. */
export function formatHours(minutes) {
  const hours = minutes / 60;
  if (hours >= 10) return `${Math.round(hours)}`;
  return `${Math.round(hours * 10) / 10}`;
}

/** Human study time that never shows a misleading "0h". */
export function formatStudyTime(minutes) {
  const value = Number(minutes) || 0;
  if (value < 60) return `${Math.round(value)}m`;
  return `${formatHours(value)}h`;
}

/** The largest milestone the student has reached, or null. */
export function milestoneReached(longestStreak) {
  let hit = null;
  for (const value of STREAK_MILESTONES) if (longestStreak >= value) hit = value;
  return hit;
}

/** Which cards this student can actually generate right now (never an empty card). */
export function shareCardKinds(facts) {
  const kinds = [];
  const hasActivity = (facts.sessions || 0) > 0
    || (facts.flashcardsReviewed || 0) > 0
    || (facts.questionsAttempted || 0) > 0
    || (facts.overallDone || 0) > 0;
  if (hasActivity) kinds.push("SNAPSHOT");
  if (facts.streak && facts.streak.current > 0) kinds.push("STREAK");
  if (facts.streak && milestoneReached(facts.streak.longest) !== null) kinds.push("MILESTONE");
  if (facts.weekly && facts.weekly.some((d) => d.minutes > 0)) kinds.push("WEEKLY");
  if (facts.totalMinutes && facts.totalMinutes > 0) kinds.push("TOTAL_TIME");
  if (facts.points && facts.points > 0) kinds.push("POINTS");
  return kinds;
}

function footerFor(facts) {
  return `${facts.appName} · ${facts.generatedOn} · built from saved records, never a running timer`;
}

/** The eight numbers every card shows, in a fixed order. */
export function snapshotStats(facts) {
  const streak = facts.streak || {};
  return [
    { label: "Study time", value: formatStudyTime(facts.totalMinutes), icon: "◷" },
    { label: "Sessions", value: `${facts.sessions ?? 0}`, icon: "▤" },
    { label: "Streak", value: `${streak.current ?? 0}d`, icon: "🔥" },
    { label: "Best streak", value: `${streak.longest ?? 0}d`, icon: "♛" },
    { label: "Flashcards", value: `${facts.flashcardsReviewed ?? 0}`, icon: "▥" },
    { label: "Questions", value: `${facts.questionsAttempted ?? 0}`, icon: "?" },
    { label: "Accuracy", value: `${facts.practiceAccuracy ?? 0}%`, icon: "✓" },
    { label: "Progress", value: `${facts.overallPct ?? 0}%`, icon: "◨" },
  ];
}

export function buildShareCard(facts, kind) {
  const base = {
    kind,
    appName: facts.appName,
    footer: footerFor(facts),
    animates: false,
    strip: facts.strip,
    stats: snapshotStats(facts),
    milestones: facts.milestones || [],
    achievements: facts.achievements || [],
    progress: {
      current: facts.overallDone ?? 0,
      target: facts.overallLeaves ?? 0,
      pct: facts.overallPct ?? 0,
      label: "overall syllabus progress",
    },
  };

  if (kind === "SNAPSHOT") {
    const hasAnything = (facts.overallLeaves || 0) > 0 || (facts.sessions || 0) > 0
      || (facts.flashcardsReviewed || 0) > 0 || (facts.questionsAttempted || 0) > 0;
    if (!hasAnything) return null;
    return {
      ...base,
      eyebrow: facts.displayName,
      headlineValue: `${facts.overallPct ?? 0}`,
      headlineUnit: "% syllabus complete",
      headlineNumber: facts.overallPct ?? 0,
      animates: true,
      accent: ACCENT.blue,
      title: "My study snapshot",
      subtitle: `${facts.overallDone ?? 0}/${facts.overallLeaves ?? 0} board items · ${formatStudyTime(facts.totalMinutes)} studied · ${facts.sessions ?? 0} sessions`,
      badges: facts.achievements || [],
    };
  }

  if (kind === "STREAK") {
    if (!facts.streak || facts.streak.current <= 0) return null;
    const { current, longest, qualifiedDays, activeDays } = facts.streak;
    return {
      ...base, eyebrow: facts.displayName, headlineValue: `${current}`,
      headlineUnit: `${dayWord(current)} streak`, headlineNumber: current, animates: true,
      accent: ACCENT.violet, title: `${current} ${dayWord(current)} in a row`,
      subtitle: "Study days measured in your own timezone, from saved sessions only.",
      streakBadge: { current, longest, fire: current >= 3 },
      progress: { ...base.progress, label: "streak consistency" },
      badges: [
        { key: "first-day", title: "First Day", icon: "🎯", unlocked: current >= 1 },
        { key: "three-day", title: "Three in a Row", icon: "🔥", unlocked: current >= 3 },
        { key: "week-warrior", title: "Week Warrior", icon: "♛", unlocked: current >= 7 },
      ],
      qualifiedDays,
      activeDays,
    };
  }

  if (kind === "MILESTONE") {
    if (!facts.streak) return null;
    const milestone = milestoneReached(facts.streak.longest);
    if (milestone === null) return null;
    return {
      ...base, eyebrow: facts.displayName, headlineValue: `${milestone}`,
      headlineUnit: `${dayWord(milestone)} milestone`, headlineNumber: milestone, animates: true,
      accent: ACCENT.coral, title: `${milestone}-day milestone unlocked`,
      subtitle: `Longest streak so far: ${facts.streak.longest} ${dayWord(facts.streak.longest)}.`,
      streakBadge: { current: facts.streak.current, longest: facts.streak.longest, fire: facts.streak.current >= 3 },
      progress: { ...base.progress, label: "streak progress" },
      badges: [
        { key: "milestone", title: "Milestone Reached", icon: "🏆", unlocked: true },
      ],
    };
  }

  if (kind === "WEEKLY") {
    if (!facts.weekly || !facts.weekly.some((d) => d.minutes > 0)) return null;
    const minutes = facts.weekly.reduce((acc, d) => acc + d.minutes, 0);
    const best = facts.weekly.reduce((a, b) => (b.minutes > a.minutes ? b : a), facts.weekly[0]);
    const activeDays = facts.weekly.filter((d) => d.minutes > 0).length;
    return {
      ...base, eyebrow: facts.displayName, headlineValue: formatHours(minutes),
      headlineUnit: "hours this week", headlineNumber: Math.round(minutes / 60), animates: true,
      accent: ACCENT.cyan, title: `${formatHours(minutes)} hours logged this week`,
      subtitle: `A day counts once you save 20+ minutes or tick 3+ items. ${activeDays} of 7 active.`,
      strip: facts.weekly.map((d) => (d.minutes >= 120 ? 4 : d.minutes >= 60 ? 3 : d.minutes >= 20 ? 2 : d.minutes >= 1 ? 1 : 0)),
      progress: { ...base.progress, label: "week activity" },
      badges: [
        { key: "weekly", title: "Weekly Grind", icon: "📚", unlocked: activeDays >= 4 },
      ],
      bestDay: best ? best.minutes : 0,
      activeDays,
    };
  }

  if (kind === "TOTAL_TIME") {
    if (!facts.totalMinutes || facts.totalMinutes <= 0) return null;
    const hours = formatHours(facts.totalMinutes);
    return {
      ...base, eyebrow: facts.displayName, headlineValue: hours, headlineUnit: "hours studied",
      headlineNumber: Math.round(facts.totalMinutes / 60), animates: true, accent: ACCENT.lime,
      title: `${hours} hours on the clock`,
      subtitle: "Every minute is a saved session — pausing and pausing again never inflates it.",
      badges: [
        { key: "hours", title: "Time Invested", icon: "⏱", unlocked: facts.totalMinutes >= 60 },
      ],
    };
  }

  if (!facts.points || facts.points <= 0 || !facts.level) return null;
  return {
    ...base, eyebrow: facts.displayName, headlineValue: `${facts.points}`,
    headlineUnit: "points earned", headlineNumber: facts.points, animates: true, accent: ACCENT.pink,
    title: `${facts.points} points · Level ${facts.level.level}`,
    subtitle: `Level ${facts.level.level} — ${facts.level.title}. Points come only from real, saved activity.`,
    xp: { current: facts.points % 250, needed: 250, label: "XP to next level" },
    level: { level: facts.level.level, title: facts.level.title, xp: facts.points, xpNeeded: 250 },
    streakBadge: { current: facts.streak?.current ?? 0, longest: facts.streak?.longest ?? 0, fire: (facts.streak?.current ?? 0) >= 3 },
    badges: [
      { key: "points", title: "Point Scorer", icon: "◈", unlocked: facts.points >= 100 },
      { key: "level", title: "Level Up", icon: "✦", unlocked: facts.level.level >= 2 },
    ],
  };
}
