/**
 * defaultTags.js — the starter tags every new student gets.
 *
 * Tags are a per-student convenience, not educational content: they describe
 * workflow states (To Do, Revise, Doubt) rather than the syllabus. Keeping this
 * small list in the app avoids a round-trip during first boot.
 */

/** Bumped when the starter tag set changes. */
export const SEED_VERSION = 2;

export const DEFAULT_TAGS = [
  { label: "To Do", kind: "status", color: "#64748b", order: 0 },
  { label: "In Progress", kind: "status", color: "#2563eb", order: 1 },
  { label: "Done", kind: "status", color: "#16a34a", order: 2 },
  { label: "Revise", kind: "status", color: "#f59e0b", order: 3 },
  { label: "Second Revision", kind: "status", color: "#9333ea", order: 4 },
  { label: "Doubt", kind: "status", color: "#dc2626", order: 5 },
  { label: "High-yield", kind: "custom", color: "#0d9488", order: 6 },
  { label: "Weak", kind: "custom", color: "#ef4444", order: 7 },
  { label: "Excluded", kind: "custom", color: "#78716c", order: 8 },
];
