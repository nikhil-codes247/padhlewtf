/**
 * exportimport.js — JSON backup, restore and validation.
 * Pure data functions (no DOM) so they can be unit-tested; the file-system
 * helpers at the bottom are browser-only and are guarded.
 */
export const APP_ID = "padhle.wtf";
export const SCHEMA_VERSION = 2;

export const STORE_KEYS = ["subjects", "chapters", "nodes", "sessions", "revisions", "notes", "planner", "tags", "points", "votes", "settings"];

/** Serialise the whole in-memory state into a portable bundle. */
export function exportBundle(state, { appVersion = "1.0.0" } = {}) {
  const stores = {};
  for (const key of STORE_KEYS) {
    const v = state[key];
    stores[key] = Array.isArray(v) ? v.map((r) => ({ ...r })) : { ...(v || {}) };
  }
  return {
    app: APP_ID,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: new Date().toISOString(),
    counts: Object.fromEntries(STORE_KEYS.map((k) => [k, Array.isArray(stores[k]) ? stores[k].length : Object.keys(stores[k]).length])),
    stores,
  };
}

/** Structural validation with human-readable errors. Never throws. */
export function validateBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== "object") return { ok: false, errors: ["The file is not a JSON object."] };
  if (bundle.app !== APP_ID) errors.push(`This does not look like a PADHLE.WTF backup (app = ${JSON.stringify(bundle.app)}).`);
  if (typeof bundle.schemaVersion !== "number") errors.push("Missing schemaVersion.");
  else if (bundle.schemaVersion > SCHEMA_VERSION) errors.push(`File was written by a newer version (schema ${bundle.schemaVersion} > ${SCHEMA_VERSION}). Update the app first.`);
  const stores = bundle.stores;
  if (!stores || typeof stores !== "object") errors.push("Missing stores object.");
  else {
    for (const key of STORE_KEYS) {
      const v = stores[key];
      const okArray = Array.isArray(v);
      const okObject = (key === "settings" || key === "votes") && v && typeof v === "object" && !Array.isArray(v);
      if (v !== undefined && !okArray && !okObject) errors.push(`stores.${key} must be an array${key === "settings" ? " or object" : ""}.`);
      if (okArray) {
        v.forEach((rec, i) => {
          if (!rec || typeof rec !== "object") errors.push(`stores.${key}[${i}] is not an object.`);
          else if (rec.id === undefined && key !== "settings") errors.push(`stores.${key}[${i}] has no id.`);
        });
      }
    }
    // referential integrity: chapters -> subjects, nodes -> chapters
    const subIds = new Set((stores.subjects || []).map((s) => s.id));
    const chIds = new Set((stores.chapters || []).map((c) => c.id));
    (stores.chapters || []).forEach((c) => { if (c.subjectId && !subIds.has(c.subjectId)) errors.push(`Chapter “${c.name || c.id}” points at a missing subject ${c.subjectId}.`); });
    (stores.nodes || []).forEach((n) => {
      if (n.chapterId && !chIds.has(n.chapterId)) errors.push(`Node “${n.name || n.id}” points at a missing chapter ${n.chapterId}.`);
    });
  }
  const capped = errors.slice(0, 12);
  return { ok: errors.length === 0, errors: capped, totalErrors: errors.length };
}

export function summariseBundle(bundle) {
  const counts = bundle?.stores
    ? Object.fromEntries(STORE_KEYS.map((k) => [k, Array.isArray(bundle.stores[k]) ? bundle.stores[k].length : Object.keys(bundle.stores[k] || {}).length]))
    : {};
  return { exportedAt: bundle?.exportedAt || null, schemaVersion: bundle?.schemaVersion, counts };
}

export function bundleToStoreMap(bundle) {
  const map = {};
  for (const key of STORE_KEYS) map[key] = bundle.stores[key] ?? (key === "settings" ? {} : []);
  return map;
}

/* ----------------------------------------------------- browser / native io -- */
import { saveTextFile } from "./native.js?v=mwz23oco";

/**
 * Saves the bundle as a file.
 *
 * In a browser this triggers an ordinary download. Inside the Android app the
 * same call is routed to Android's "save as" picker instead, because a WebView
 * ignores `download` on a blob URL — the download would silently do nothing.
 * `saveTextFile` reports whether the shell took over, so this stays one code
 * path with two backends rather than two code paths.
 */
export function downloadJson(filename, obj) {
  const text = JSON.stringify(obj, null, 2);
  if (saveTextFile(filename, "application/json", text)) return;
  writeBlob(filename, text, "application/json");
}

export function downloadCsv(filename, rows, columns) {
  const escape = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => escape(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => escape(typeof c.value === "function" ? c.value(r) : r[c.value])).join(",")).join("\n");
  const text = head + "\n" + body;
  if (saveTextFile(filename, "text/csv", text)) return;
  writeBlob(filename, text, "text/csv");
}

function writeBlob(filename, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    if (typeof file.text === "function") {
      file.text().then((text) => {
        try { resolve(JSON.parse(text)); }
        catch (e) { reject(new Error("That file is not valid JSON.")); }
      }).catch(reject);
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read the file."));
    reader.onload = () => {
      try { resolve(JSON.parse(String(reader.result))); }
      catch (e) { reject(new Error("That file is not valid JSON.")); }
    };
    reader.readAsText(file);
  });
}
