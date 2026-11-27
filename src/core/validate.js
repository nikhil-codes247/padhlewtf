/** validate.js — small, explicit input validation. Every mutator calls one of these. */
import { isValidISO } from "./dates.js?v=mwz8yitl";

export const STATUSES = ["To Do", "In Progress", "Done", "Revise", "Second Revision", "Doubt"];
export const PRIORITIES = ["P1", "P2", "P3"];
export const ACTIVITIES = [
  { id: "learn", label: "Initial learning" },
  { id: "practice", label: "Practice" },
  { id: "revision", label: "Revision" },
  { id: "doubt", label: "Doubt resolution" },
];
export const KINDS = [
  { id: "topic", label: "Topic" },
  { id: "subtopic", label: "Subtopic" },
  { id: "task", label: "Checklist item" },
];

export function requiredName(value, what = "Name") {
  const v = String(value ?? "").trim();
  if (!v) return { ok: false, error: `${what} cannot be empty.` };
  if (v.length > 160) return { ok: false, error: `${what} must be under 160 characters.` };
  return { ok: true, value: v };
}

export function minutesOrNull(value, { max = 1440 } = {}) {
  if (value === "" || value == null) return { ok: true, value: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Minutes must be a number of 0 or more." };
  if (n > max) return { ok: false, error: `Minutes must be ${max} or less.` };
  return { ok: true, value: Math.round(n) };
}

export function dateOrNull(value) {
  if (!value) return { ok: true, value: null };
  if (!isValidISO(value)) return { ok: false, error: "Date must be a valid calendar date (YYYY-MM-DD)." };
  return { ok: true, value };
}

export function inSet(value, set, fallback) {
  return set.includes(value) ? value : fallback;
}

/** Normalise a comma / space separated tag string into a clean array. */
export function parseTags(input, known = []) {
  const raw = Array.isArray(input) ? input : String(input ?? "").split(",");
  const knownByLower = new Map(known.map((k) => [String(k).toLowerCase(), k]));
  const out = [];
  for (const t of raw) {
    const v = String(t).trim();
    if (!v) continue;
    const canonical = knownByLower.get(v.toLowerCase()) || v;
    if (!out.some((x) => x.toLowerCase() === canonical.toLowerCase())) out.push(canonical);
  }
  return out.slice(0, 20);
}

/** Session sanity: start < end when both are given; minutes must be positive. */
export function validateSession({ minutes, startISO, endISO }) {
  const m = minutesOrNull(minutes);
  if (!m.ok) return m;
  if (m.value === null || m.value === 0) {
    if (startISO && endISO) {
      const a = new Date(startISO), b = new Date(endISO);
      if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
        return { ok: true, value: Math.round((b - a) / 60000) };
      }
    }
    return { ok: false, error: "A study session needs a duration greater than zero." };
  }
  if (startISO && endISO) {
    const a = new Date(startISO), b = new Date(endISO);
    if (Number.isFinite(a) && Number.isFinite(b) && b <= a) {
      return { ok: false, error: "End time must be after the start time." };
    }
  }
  return m;
}

/** Guard against absurd timer values (e.g. laptop asleep for 3 days). */
export function clampSessionMinutes(min, { warnOver = 8 * 60, max = 16 * 60 } = {}) {
  const m = Math.round(min);
  if (m <= 0) return { ok: false, value: 0 };
  if (m > max) return { ok: false, value: max, warning: `Capped at ${max / 60}h — please check this session.` };
  if (m > warnOver) return { ok: true, value: m, warning: `That is longer than ${warnOver / 60}h — double-check before saving.` };
  return { ok: true, value: m };
}
