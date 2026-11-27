/**
 * subjectCatalog.js — the subject catalogue, sourced from Supabase.
 *
 * The eleven CBSE subjects are shared data in the `subjects` table. Signed-in
 * students get their own copy in `study_subjects`, and the public landing page
 * reads the same catalogue anonymously. Nothing here is hard-coded: if the
 * deployment is seeded, the catalogue is available; if not, surfaces fall back
 * to the stable subject ids until the catalogue arrives.
 */
import { account } from "./account.js?v=mwz8hppl";
import { selectRows, callRpc } from "./supabase.js?v=mwz8hppl";

const CACHE_TTL_MS = 5 * 60 * 1000;

const cache = new Map();
let totals = { subjects: 0, chapters: 0, topics: 0 };
let loadedAt = 0;
let loading = null;

function normalise(row) {
  return {
    id: row.id,
    name: row.name || row.id,
    short: row.short_name ?? row.short ?? row.name ?? row.id,
    code: row.code ?? "",
    color: row.color || "var(--accent)",
    accent: row.accent || row.color || "var(--accent)",
    kind: row.kind ?? null,
  };
}

/** Add Supabase subject rows to the in-memory catalogue. */
export function rememberSubjects(rows) {
  for (const row of rows || []) {
    if (row?.id) cache.set(row.id, normalise(row));
  }
}

/** Look up a subject by id. The student's own copy wins when present. */
export function subjectMeta(id) {
  if (!id) return null;
  const own = account.catalog?.find?.((s) => s.id === id);
  if (own) return normalise(own);
  return cache.get(id) || null;
}

/**
 * Load the public catalogue and the syllabus totals once. Safe to call when
 * signed out: `subjects` and `syllabus_totals()` are readable by anonymous
 * visitors.
 */
export function loadPublicCatalogue() {
  if (cache.size && Date.now() - loadedAt < CACHE_TTL_MS) return Promise.resolve();
  if (loading) return loading;

  loading = (async () => {
    try {
      const rows = await selectRows(
        "subjects",
        "select=id,name,short_name,code,color,accent,kind,sort_order&order=sort_order.asc",
      );
      rememberSubjects(rows);
      loadedAt = Date.now();
    } catch (err) {
      console.warn("[catalogue] subjects unavailable:", err?.message || err);
    }
    try {
      const result = await callRpc("syllabus_totals");
      const row = Array.isArray(result) ? result[0] : result;
      if (row) {
        totals = {
          subjects: Number(row.subjects) || 0,
          chapters: Number(row.chapters) || 0,
          topics: Number(row.topics) || 0,
        };
      }
    } catch {
      // Totals stay at zero until the deployment is seeded.
    }
  })().finally(() => { loading = null; });

  return loading;
}

/** Current syllabus totals. Zero until the catalogue has loaded. */
export function syllabusTotals() {
  return totals;
}
