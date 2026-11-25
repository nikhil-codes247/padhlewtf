/**
 * config.js — browser-safe runtime configuration.
 *
 * Values come from `config.js` at the app root, which is generated from
 * environment variables at build time (or served dynamically by the local dev
 * server). Only the Supabase URL and its public anon key belong here; the
 * service-role key must never reach the browser.
 *
 * The parsing is a pure function so it can be tested without a browser. A
 * deployment without a Supabase URL and anon key is a misconfiguration: the app
 * has no local fallback and cannot serve any data without them.
 */

const DEFAULT_CONFIG = Object.freeze({
  supabaseUrl: "",
  supabaseAnonKey: "",
  siteUrl: "",
  environment: "development",
});

function trimUrl(value) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function validUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

/**
 * Normalise a raw configuration object. Unknown keys are dropped, malformed
 * URLs are ignored (rather than crashing the app), and the anon key is trimmed.
 * An invalid URL is reported through `errors` so the UI can explain itself.
 */
export function readConfig(raw = {}) {
  const errors = [];
  const supabaseUrlRaw = trimUrl(raw.supabaseUrl);
  const supabaseUrl = validUrl(supabaseUrlRaw);
  if (supabaseUrlRaw && !supabaseUrl) {
    errors.push("The Supabase URL is not a valid http(s) URL.");
  }
  const supabaseAnonKey = String(raw.supabaseAnonKey ?? "").trim();
  if (supabaseUrl && !supabaseAnonKey) {
    errors.push("The Supabase URL is set but the anon key is missing.");
  }
  // Only complain about a key without a URL when no URL was supplied at all;
  // a malformed URL already has a more precise error above.
  if (!supabaseUrlRaw && supabaseAnonKey) {
    errors.push("The Supabase anon key is set but the project URL is missing.");
  }
  const siteUrl = validUrl(trimUrl(raw.siteUrl)) || (typeof location !== "undefined" ? location.origin : "");
  return {
    ...DEFAULT_CONFIG,
    supabaseUrl,
    supabaseAnonKey,
    siteUrl,
    environment: String(raw.environment || DEFAULT_CONFIG.environment),
    errors,
  };
}

function readRuntime() {
  if (typeof globalThis === "undefined") return {};
  const win = globalThis.window || globalThis;
  return win && win.PADHLE_CONFIG ? win.PADHLE_CONFIG : {};
}

export let config = readConfig(readRuntime());

export function refreshConfig() {
  config = readConfig(readRuntime());
}

/** True when a Supabase project is configured. Required for every request. */
export function accountsAvailable() {
  return Boolean(config.supabaseUrl && config.supabaseAnonKey);
}
