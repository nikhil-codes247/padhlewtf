/**
 * dates.js — pure date helpers. Every date in the app is a local calendar date
 * string "YYYY-MM-DD" (never a Date object in storage) so timezones can't shift it.
 */
const MS = 86400000;

export function todayISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse "YYYY-MM-DD" into a Date at local noon (DST-safe for day arithmetic). */
export function fromISO(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function addDays(iso, n) {
  if (!iso) return null;
  const d = fromISO(iso);
  if (!d) return null;
  const r = new Date(d.getTime() + n * MS);
  if (isNaN(r.getTime())) return null;
  return todayISO(r);
}

/** Whole days from a -> b (b - a). Negative when b is in the past. */
export function diffDays(a, b) {
  const da = fromISO(a), db = fromISO(b);
  if (!da || !db) return null;
  return Math.round((db.getTime() - da.getTime()) / MS);
}

export function isValidISO(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = fromISO(s);
  return !!d && todayISO(d) === s; // rejects 2026-13-01 / 2026-02-30 rollovers
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

export function fmtShort(iso) {
  const d = fromISO(iso);
  if (!d) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function weekdayName(iso) {
  const d = fromISO(iso);
  return d ? DAYS[d.getDay()] : "—";
}
export function monthName(m) { return MONTHS[m]; }

/** Human relative phrasing used for deadlines. */
export function relative(iso, today = todayISO()) {
  if (!iso) return "";
  const n = diffDays(today, iso);
  if (n === null) return "";
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 0) return `in ${n} days`;
  return `${-n} days ago`;
}

export function deadlineStatus(iso, today = todayISO(), dueWarn = 7) {
  if (!iso) return "none";
  const n = diffDays(today, iso);
  if (n === null) return "none";
  if (n < 0) return "overdue";
  if (n <= dueWarn) return "soon";
  return "upcoming";
}

/** Monday-based week start. */
export function startOfWeek(iso) {
  const d = fromISO(iso);
  const dow = (d.getDay() + 6) % 7; // Mon=0
  return addDays(iso, -dow);
}

export function weekDates(iso) {
  const s = startOfWeek(iso);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

/** 6x7 grid for a month view; returns ISO strings or null for padding cells. */
export function monthGrid(year, month /* 0-based */) {
  const first = new Date(year, month, 1, 12);
  const start = fromISO(todayISO(first));
  const lead = (start.getDay() + 6) % 7; // Mon-first
  const grid = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(year, month, 1 - lead + i, 12);
    grid.push(d.getMonth() === month ? todayISO(d) : null);
  }
  return grid;
}

export function fmtDuration(min) {
  min = Math.max(0, Math.round(min || 0));
  const h = Math.floor(min / 60), m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}
