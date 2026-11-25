/**
 * excitement.js — the roadmap "What's New?" poll.
 *
 * One vote per student, three fixed answers. "Excited" is deliberately the sum of
 * the two positive answers; "I have ideas to share" is a contribution signal, not a
 * positive/negative vote, so counting it as excitement would inflate the number.
 * Pure and DOM-free so the tally maths can be tested without storage.
 */

export const EXCITEMENT_OPTIONS = [
  { choice: "ABSOLUTELY", emoji: "🔥", label: "Absolutely! Can't wait!", short: "Absolutely" },
  { choice: "AWESOME", emoji: "😎", label: "Sounds awesome!", short: "Awesome" },
  { choice: "IDEAS", emoji: "💡", label: "I have ideas to share!", short: "Ideas" },
];

const EMPTY_EXCITEMENT_COUNTS = { ABSOLUTELY: 0, AWESOME: 0, IDEAS: 0 };

/** Turn raw tallies into a stable summary; unknown choices are ignored, never thrown. */
export function summariseVotes(tallies) {
  const counts = { ...EMPTY_EXCITEMENT_COUNTS };
  for (const tally of tallies || []) {
    if (tally && tally.choice in counts) counts[tally.choice] += Math.max(0, Math.trunc(Number(tally.count) || 0));
  }
  const total = counts.ABSOLUTELY + counts.AWESOME + counts.IDEAS;
  const positive = counts.ABSOLUTELY + counts.AWESOME;
  const excitedPercent = total > 0 ? Math.round((positive / total) * 100) : 0;

  let topChoice = null;
  let top = 0;
  for (const option of EXCITEMENT_OPTIONS) {
    if (counts[option.choice] > top) { top = counts[option.choice]; topChoice = option.choice; }
  }
  return { counts, total, excitedPercent, topChoice };
}

export function optionPercent(summary, choice) {
  if (!summary || summary.total <= 0) return 0;
  return Math.round((summary.counts[choice] / summary.total) * 100);
}
