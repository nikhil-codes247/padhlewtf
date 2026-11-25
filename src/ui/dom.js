/** dom.js — tiny, dependency-free DOM + formatting helpers. */

export function esc(v) {
  return String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** HTML string -> single element. */
export function h(html) {
  const t = document.createElement("template");
  t.innerHTML = String(html).trim();
  return t.content.firstElementChild;
}

export function debounce(fn, ms = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/** Build a data-attribute string from an object; undefined/null are skipped. */
export function attrs(obj) {
  return Object.entries(obj || {})
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${k}="${esc(v === true ? "1" : v)}"`)
    .join(" ");
}

export function option(value, label, selected, extra = "") {
  return `<option value="${esc(value)}"${selected === value ? " selected" : ""}${extra}>${esc(label)}</option>`;
}

export function fmtPct(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return "—";
  const v = Number(n);
  return `${digits ? v.toFixed(digits) : Math.round(v)}%`;
}

export function fmtNum(n) { return Number(n || 0).toLocaleString(); }

export function pctTone(pct) {
  const n = Number(pct) || 0;
  if (n >= 80) return "ok";
  if (n >= 40) return "";
  if (n > 0) return "warn";
  return "bad";
}

export function pluralise(n, one, many) { return `${n} ${n === 1 ? one : many || one + "s"}`; }

export function initials(text, n = 2) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, n).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Group an array by a key function. */
export function groupBy(arr, keyFn) {
  const m = new Map();
  for (const item of arr) {
    const k = keyFn(item);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(item);
  }
  return m;
}

export function sum(arr, fn = (x) => x) { return arr.reduce((a, b) => a + (Number(fn(b)) || 0), 0); }

export function sortBy(arr, fn, dir = 1) {
  return [...arr].sort((a, b) => {
    const av = fn(a), bv = fn(b);
    if (av === bv) return 0;
    return (av > bv ? 1 : -1) * dir;
  });
}
