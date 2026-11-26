/**
 * supabase.js — a small, dependency-free Supabase client.
 *
 * PADHLE.WTF is a vanilla ES-module app with no bundler, so instead of pulling in
 * `@supabase/supabase-js` (and a build step) this module talks to the two public
 * Supabase APIs the app needs:
 *
 *   · Supabase Auth (GoTrue)   — sign up, sign in, refresh, sign out
 *   · PostgREST                — profiles, subject selection, catalog rows
 *
 * The anon key is the only credential used here; it is public by design and is
 * protected by Row Level Security. The service-role key must never appear in
 * browser code.
 *
 * Sessions are persisted in localStorage (the browser equivalent of the
 * official client's `persistSession`) and refreshed shortly before they expire.
 * Every failure is surfaced as a `SupabaseError` with a human message, a status
 * and the provider's code where there is one.
 */
import { config, accountsAvailable } from "./config.js";
import { enqueue } from "./requestQueue.js";
import { cacheGet, cacheInvalidate, cacheClear } from "./requestCache.js";

const SESSION_KEY = "padhle.auth.v1";
const REFRESH_WINDOW_MS = 60 * 1000;
const TIMEOUT_MS = 15000;

/** How long a Supabase GET response is cached in the browser (ms). */
const GET_CACHE_TTL_MS = 10000;

export class SupabaseError extends Error {
  constructor(message, { status = 0, code = null, hint = null, cause = null } = {}) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.code = code;
    this.hint = hint;
    this.cause = cause;
  }
}

/* ---------------------------------------------------------------- session -- */

let memorySession = null;
let refreshInFlight = null;

function storage() {
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readSession() {
  try {
    const raw = storage()?.getItem(SESSION_KEY);
    if (!raw) return memorySession;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return memorySession;
  }
}

function writeSession(session) {
  memorySession = session;
  try {
    if (session) storage()?.setItem(SESSION_KEY, JSON.stringify(session));
    else storage()?.removeItem(SESSION_KEY);
  } catch {
    // Private-mode storage can be read-only; the in-memory copy still works.
  }
}

function normalizeSession(data, previous = null) {
  const expiresIn = Number(data.expires_in) || 3600;
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token || previous?.refresh_token || null,
    token_type: data.token_type || "bearer",
    expires_in: expiresIn,
    expires_at: Date.now() + expiresIn * 1000,
    user: data.user || previous?.user || null,
  };
}

/** Drop the stored session (used on sign-out and on a rejected refresh). */
export function clearSession() {
  writeSession(null);
  // Cached GET responses belong to the previous identity. Never let them leak
  // into the next session (or mask freshly written data).
  cacheClear();
}

export function currentSession() {
  return readSession();
}

export function currentUser() {
  return readSession()?.user || null;
}

/**
 * Supabase email links (confirmation, magic link, recovery) redirect back with
 * the session in the URL fragment:
 *
 *   #access_token=…&expires_in=3600&refresh_token=…&token_type=bearer&type=signup
 *
 * The fragment is never sent to a server, so it is safe to read here. The
 * session is stored and the address bar is tidied so a refresh does not replay
 * the one-time token. Returns the stored session, or null when the URL is not
 * an auth callback.
 */
export function consumeAuthCallback() {
  if (typeof location === "undefined" || !location.hash) return null;
  const fragment = String(location.hash).replace(/^#/, "");
  if (!fragment.includes("access_token=") && !fragment.includes("error=")) return null;

  const params = new URLSearchParams(fragment);
  const accessToken = params.get("access_token");

  // Remove the tokens from the address bar and from history, whatever the result.
  if (typeof history !== "undefined" && typeof history?.replaceState === "function") {
    try { history.replaceState(null, "", `${location.pathname || "/"}${location.search || ""}`); } catch { /* file:// */ }
  }

  if (!accessToken) return null;
  const session = normalizeSession({
    access_token: accessToken,
    refresh_token: params.get("refresh_token"),
    token_type: params.get("token_type") || "bearer",
    expires_in: Number(params.get("expires_in")) || 3600,
  });
  writeSession(session);
  return session;
}

/* ------------------------------------------------------------------ fetch -- */

async function fetchJson(url, { method = "GET", headers = {}, body } = {}) {
  if (typeof fetch !== "function") {
    throw new SupabaseError("This browser cannot connect to the account service.", { code: "fetch_unavailable" });
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { method, headers, body, signal: controller.signal });
  } catch (err) {
    const aborted = err?.name === "AbortError";
    throw new SupabaseError(
      aborted ? "The account service took too long to respond. Try again." : "Could not reach the account service. Check your connection.",
      { code: aborted ? "timeout" : "network", cause: err },
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text().catch(() => "");
  let data = null;
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }
  if (!res.ok) throw toError(res.status, data);
  return data;
}

function providerMessage(data) {
  if (!data) return "";
  if (typeof data === "string") return data;
  return data.msg || data.message || data.error_description || data.error || data.details || "";
}

function toError(status, data) {
  const raw = providerMessage(data);
  const code = data?.code || data?.error_code || data?.error || null;
  const lower = String(raw || "").toLowerCase();
  let message = raw;
  if (status === 400 && (lower.includes("invalid login credentials") || lower.includes("invalid_grant"))) {
    message = "Email or password is incorrect.";
  } else if (lower.includes("email not confirmed") || code === "email_not_confirmed") {
    message = "Confirm your email address first — check your inbox for the link.";
  } else if (status === 422 && lower.includes("already registered")) {
    message = "An account with this email already exists. Log in instead.";
  } else if (status === 409 || code === "23505" || lower.includes("duplicate key")) {
    message = "That username is already taken.";
  } else if (status === 401 && (lower.includes("jwt") || lower.includes("token"))) {
    message = "Your session has expired. Please log in again.";
  } else if (status === 403 || code === "42501" || lower.includes("row-level security")) {
    message = "You do not have permission to do that.";
  } else if (!message) {
    message = status === 429 ? "Too many attempts. Wait a moment and try again." : `The account service returned an error (${status}).`;
  }
  return new SupabaseError(message, { status, code: typeof code === "string" ? code : null, hint: data?.hint || null });
}

function base(path) {
  return `${config.supabaseUrl}${path}`;
}

/**
 * Every request needs the backend. There is no local fallback: an unconfigured
 * deployment cannot serve any data, so say so plainly instead of failing
 * deeper in the stack.
 */
function requireBackend() {
  if (!accountsAvailable()) {
    throw new SupabaseError("This deployment is not connected to the account service.", { code: "not_configured" });
  }
}

function publicHeaders(extra = {}) {
  return {
    apikey: config.supabaseAnonKey,
    Authorization: `Bearer ${config.supabaseAnonKey}`,
    ...extra,
  };
}

/* ------------------------------------------------------------------- auth -- */

function saveAuthResponse(data) {
  if (!data?.access_token) return null;
  const session = normalizeSession(data);
  writeSession(session);
  // A signed-in identity must never read from the previous session's cache.
  cacheClear();
  return session;
}

/**
 * Ensure a usable session, refreshing it when it is close to expiry. A failed
 * refresh clears the session so the UI can send the visitor back to log in.
 */
export async function getSession() {
  const session = readSession();
  if (!session?.access_token) return null;
  const expiring = session.expires_at && Date.now() > session.expires_at - REFRESH_WINDOW_MS;
  if (!expiring || !session.refresh_token) return session;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const data = await fetchJson(base("/auth/v1/token?grant_type=refresh_token"), {
        method: "POST",
        headers: publicHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      });
      const next = normalizeSession(data, session);
      writeSession(next);
      return next;
    } catch {
      clearSession();
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function signUpWithPassword(email, password, metadata = {}) {
  requireBackend();
  const data = await fetchJson(base("/auth/v1/signup"), {
    method: "POST",
    headers: publicHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password, data: metadata }),
  });
  // With email confirmation on, Supabase returns `{ user, session: null }`.
  const session = data?.access_token ? saveAuthResponse(data) : data?.session ? saveAuthResponse(data.session) : null;
  return {
    user: data?.user || session?.user || null,
    session,
    needsConfirmation: !session,
  };
}

export async function signInWithPassword(email, password) {
  requireBackend();
  const data = await fetchJson(base("/auth/v1/token?grant_type=password"), {
    method: "POST",
    headers: publicHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email, password }),
  });
  const session = saveAuthResponse(data);
  if (!session) throw new SupabaseError("The account service did not return a session.", { code: "no_session" });
  return session;
}

/**
 * Start Google OAuth sign-in. Redirects the browser to Supabase's authorize
 * endpoint; Supabase sends the user to Google, then back to redirectTo with
 * a session fragment that consumeAuthCallback() picks up on page load.
 * This function does not return on success (the browser navigates away).
 */
export async function signInWithGoogle() {
  requireBackend();
  const redirectTo = `${config.siteUrl}/#/login`;
  const url = new URL(base("/auth/v1/authorize"));
  url.searchParams.set("provider", "google");
  url.searchParams.set("redirect_to", redirectTo);
  window.location.href = url.toString();
  // If the redirect is blocked (popup blocker etc.), surface an error.
  throw new SupabaseError("Google sign-in was blocked or cancelled.", { code: "oauth_blocked" });
}

export async function refreshUser() {
  const session = await getSession();
  if (!session) return null;
  const data = await fetchJson(base("/auth/v1/user"), { headers: { ...publicHeaders(), Authorization: `Bearer ${session.access_token}` } });
  if (data?.id) {
    const next = { ...session, user: data };
    writeSession(next);
    return next.user;
  }
  return null;
}

export async function signOut() {
  const session = readSession();
  if (session?.access_token) {
    try {
      await fetchJson(base("/auth/v1/logout"), {
        method: "POST",
        headers: { ...publicHeaders(), Authorization: `Bearer ${session.access_token}` },
      });
    } catch {
      // A local sign-out must succeed even when the network does not.
    }
  }
  clearSession();
}

/**
 * Send a password-reset link to the given email. Supabase emails the user a
 * link that lets them set a new password. Returns nothing on success.
 */
export async function resetPasswordForEmail(email) {
  requireBackend();
  const data = await fetchJson(base("/auth/v1/recover"), {
    method: "POST",
    headers: publicHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ email }),
  });
  return data;
}

/* -------------------------------------------------------------- postgrest -- */

async function restRequest(path, { method = "GET", body, prefer, auth = true } = {}) {
  requireBackend();

  const fetchTask = async () => {
    const session = auth ? await getSession() : null;
    const headers = publicHeaders({ "Content-Type": "application/json" });
    if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
    if (prefer) headers.Prefer = prefer;
    const data = await fetchJson(base(`/rest/v1/${path}`), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return data;
  };

  const table = path.split("?")[0].split("/")[0]; // e.g. "chapters" or "rpc/..."

  // GET reads: short-lived cache + in-flight dedup, under the concurrency cap.
  if (method === "GET") {
    const key = `GET /rest/v1/${path}`;
    return cacheGet(key, () => enqueue(fetchTask), GET_CACHE_TTL_MS);
  }

  // Writes: run under the concurrency cap with retry, then bust the cache for
  // this table so the next read returns fresh data.
  const result = await enqueue(fetchTask);
  cacheInvalidate(`GET /rest/v1/${table}`);
  return result;
}

/** GET `/rest/v1/<table>?<query>` (query without the leading `?`). */
export function selectRows(table, query = "") {
  // PostgREST caps a response at the project's "max rows" setting (1,000 by
  // default on Supabase). Page through larger tables so history and the shared
  // revision catalogue are never silently truncated. A caller that asks for an
  // explicit `limit` keeps single-request semantics.
  if (/(^|&)limit=/.test(query)) {
    return restRequest(`${table}${query ? `?${query}` : ""}`);
  }
  return (async () => {
    const all = [];
    for (let offset = 0; ; offset += SELECT_PAGE_SIZE) {
      const pageQuery = [query, `limit=${SELECT_PAGE_SIZE}`, `offset=${offset}`]
        .filter(Boolean)
        .join("&");
      const page = await restRequest(`${table}?${pageQuery}`);
      if (!Array.isArray(page) || page.length === 0) break;
      all.push(...page);
      if (page.length < SELECT_PAGE_SIZE) break;
    }
    return all;
  })();
}

/**
 * PostgREST rejects a batched write whose objects do not all carry the same
 * keys ("All object keys must match"). Seeded records are not uniform — for
 * example only some chapters have a `nextAction` — so a batch is split into
 * groups that share an identical key set before being sent.
 */
function groupByKeys(rows) {
  const groups = new Map();
  for (const row of rows) {
    const signature = Object.keys(row).sort().join("\u0000");
    const bucket = groups.get(signature);
    if (bucket) bucket.push(row);
    else groups.set(signature, [row]);
  }
  return [...groups.values()];
}

/** Keep a single request small enough to finish well inside the fetch timeout. */
const WRITE_BATCH_SIZE = 500;

/** Rows per request when paging through a large read. */
const SELECT_PAGE_SIZE = 1000;

/** Send rows in key-homogeneous groups and flatten the returned representation. */
async function writeRows(table, rows, { query = "", prefer } = {}) {
  const list = Array.isArray(rows) ? rows : [rows];
  const out = [];
  for (const group of groupByKeys(list)) {
    for (let i = 0; i < group.length; i += WRITE_BATCH_SIZE) {
      const batch = group.slice(i, i + WRITE_BATCH_SIZE);
      const data = await restRequest(`${table}${query}`, { method: "POST", body: batch, prefer });
      if (Array.isArray(data)) out.push(...data);
      else if (data !== null && data !== undefined) out.push(data);
    }
  }
  return out;
}

/** POST rows and return the inserted representation. */
export function insertRows(table, rows) {
  return writeRows(table, rows, { prefer: "return=representation" });
}

/** PATCH rows. `query` selects them, e.g. `id=eq.<uuid>`. */
export function updateRows(table, query, patch) {
  return restRequest(`${table}?${query}`, { method: "PATCH", body: patch, prefer: "return=representation" });
}

/**
 * POST rows with PostgREST's merge-duplicates resolution, keyed by
 * `onConflict`. Used for the per-user settings row: the first save inserts it,
 * every later save updates it in place.
 */
export function upsertRows(table, rows, onConflict = "user_id") {
  const suffix = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  return writeRows(table, rows, {
    query: suffix,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}

/**
 * Call a Postgres function exposed through PostgREST.
 *
 * A stored procedure can change data in *any* table: `set_subject_selection`
 * writes to `profile_subjects`, `reset_account_data` to `user_settings`,
 * `delete_account` to the profile and the auth user. The short-lived read
 * cache cannot know that, so every function call drops the cached answers.
 * Without this the app keeps showing the state from *before* the save — the
 * student picks their subjects and the app still believes they picked none.
 *
 * Functions are rare (subject choice, account reset, account deletion), so
 * clearing the whole cache costs a few small re-reads and buys correctness.
 */
export async function callRpc(name, args = {}) {
  const data = await restRequest(`rpc/${name}`, { method: "POST", body: args });
  cacheClear();
  return data;
}

/** DELETE rows. `query` selects them, e.g. `id=eq.<uuid>` or `id=in.(...)`. */
export function deleteRows(table, query = "") {
  return restRequest(`${table}${query ? `?${query}` : ""}`, { method: "DELETE" });
}

export { accountsAvailable };
