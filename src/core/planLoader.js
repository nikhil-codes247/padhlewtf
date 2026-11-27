/**
 * planLoader.js — turns the 60-day plan template into real
 * planner records, shifted so Day 1 lands on a date the user chooses.
 * Pure functions: no DB, no DOM.
 */
import { addDays } from "./dates.js?v=mwz1qwqk";
import { newId } from "./ids.js?v=mwz1qwqk";

const norm = (s) => String(s ?? "").toLowerCase().normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu, "");

/** Aliases so plan rows that say "Maths" still map to the right subject. */
const ALIASES = {
  mathematics: ["maths", "math", "mathematics"],
  science: ["science", "sci"],
  socialscience: ["sst", "social", "socialscience", "history", "geography", "civics", "economics"],
  english: ["english", "eng", "englishlanguageandliterature"],
  hindi: ["hindi", "hin", "hindicourseb"],
  artificialintelligence: ["ai", "artificialintelligence"],
};

export function buildSubjectLookup(subjects) {
  const map = new Map();
  for (const s of subjects) {
    const keys = new Set([norm(s.name), norm(s.short), norm(s.code)]);
    for (const list of Object.values(ALIASES)) if (list.includes(norm(s.short)) || list.includes(norm(s.name))) list.forEach((a) => keys.add(norm(a)));
    for (const k of keys) if (k && !map.has(k)) map.set(k, s.id);
  }
  return map;
}

export function matchSubjectId(subjectLabel, lookup) {
  const key = norm(subjectLabel);
  if (!key) return null;
  if (lookup.has(key)) return lookup.get(key);
  for (const [k, id] of lookup) if (k && (key.includes(k) || k.includes(key))) return id;
  return null;
}

/**
 * Best-effort chapter match inside one subject. Returns {chapterId, exact}.
 * Never guesses across subjects; returns null when unsure.
 */
export function matchChapter(chapters, subjectId, topicLabel) {
  if (!subjectId) return { chapterId: null, exact: false };
  const pool = chapters.filter((c) => c.subjectId === subjectId);
  const t = norm(topicLabel);
  if (!t) return { chapterId: null, exact: false };
  let best = null, bestScore = 0;
  for (const c of pool) {
    const n = norm(c.name);
    if (!n) continue;
    let score = 0;
    if (n === t) score = 1;
    else if (t.startsWith(n) || n.startsWith(t)) score = 0.9;
    else if (t.includes(n) || n.includes(t)) score = 0.8;
    else {
      const ta = new Set(t.match(/[\p{L}\p{N}]+/gu) || []);
      const na = new Set(n.match(/[\p{L}\p{N}]+/gu) || []);
      if (ta.size && na.size) {
        let inter = 0;
        for (const x of ta) if (na.has(x)) inter += 1;
        score = inter / Math.max(ta.size, na.size);
      }
    }
    if (score > bestScore) { bestScore = score; best = c; }
  }
  if (best && bestScore >= 0.6) return { chapterId: best.id, exact: bestScore === 1, score: bestScore };
  return { chapterId: null, exact: false, score: bestScore };
}

/**
 * Build planner records from the template.
 * @param {{template:Array, subjects:Array, chapters:Array, startDate:string, onlyUnmatched?:boolean}} opts
 */
export function buildPlanEntries({ template, subjects, chapters, startDate }) {
  const lookup = buildSubjectLookup(subjects);
  const out = [];
  let matched = 0, unmatched = 0;
  for (const row of template) {
    const dateISO = addDays(startDate, Number(row.day) - 1);
    const subjectId = matchSubjectId(row.subject, lookup);
    const m = matchChapter(chapters, subjectId, row.topic);
    if (m.chapterId) matched += 1; else unmatched += 1;
    const title = row.topic && row.topic !== row.subject ? `${row.topic}` : (row.subject || "Study block");
    out.push({
      id: newId("pl"),
      dateISO,
      day: row.day,
      slot: row.slot || null,
      subjectId: subjectId || null,
      subjectLabel: row.subject || "",
      chapterId: m.chapterId,
      topicLabel: row.topic || "",
      title,
      task: row.task || "",
      target: row.target || "",
      estMin: Number(row.minutes) || 30,
      priority: m.exact ? "P2" : "P3",
      done: false,
      order: out.length,
      movedFrom: null,
      createdAt: new Date().toISOString(),
    });
  }
  return { entries: out, matched, unmatched };
}
