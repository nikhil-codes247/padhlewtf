/** Stable-ish id generation. Works in the browser and in Node >= 19. */
export function newId(prefix = "id") {
  const c = globalThis.crypto;
  const rand = c && typeof c.randomUUID === "function"
    ? c.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** URL-safe slug that keeps unicode letters (Devanagari chapter names survive). */
export function slug(s) {
  return String(s)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Deep-ish clone for plain data (records are always plain objects/arrays). */
export function clone(v) {
  return v == null ? v : JSON.parse(JSON.stringify(v));
}
