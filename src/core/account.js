/**
 * account.js — the browser-side account state.
 *
 * This is deliberately separate from the study store: the store owns
 * syllabus/progress, while this module owns the authenticated identity, the
 * unique username, and the chosen subjects in Supabase.
 *
 * Supabase is the only backend. There is no local mode: an unconfigured
 * deployment is a misconfiguration, not a supported operating mode.
 */
import {
  getSession, signUpWithPassword, signInWithPassword, signInWithGoogle, signOut as supabaseSignOut,
  selectRows, insertRows, updateRows, upsertRows, callRpc, clearSession, refreshUser, consumeAuthCallback,
  resetPasswordForEmail,
} from "./supabase.js?v=mwz1qwqk";
import { validateSubjectSelection } from "./subjects.js?v=mwz1qwqk";

const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const PROFILE_FIELDS = "id,username,display_name,avatar,created_at,plan,plan_expires_at";
const SELECTION_FIELDS = "subject_id,kind";
const SETTINGS_FIELDS = [
  "user_id", "theme", "reduce_motion", "reminder_enabled", "reminder_time",
  "notify_timer_end", "daily_target_min", "target_date", "study_days",
  "available_today_min", "due_warn_days", "updated_at",
].join(",");
const PENDING_SIGNUP_KEY = "padhle.pending.signup.v1";

/** camelCase setting ↔ snake_case column. Only the account-owned subset. */
const SETTINGS_COLUMNS = Object.freeze({
  theme: "theme",
  reduceMotion: "reduce_motion",
  reminderEnabled: "reminder_enabled",
  reminderTime: "reminder_time",
  notifyTimerEnd: "notify_timer_end",
  dailyTargetMin: "daily_target_min",
  targetDate: "target_date",
  studyDays: "study_days",
  availableTodayMin: "available_today_min",
  dueWarnDays: "due_warn_days",
});

export const account = {
  /** True once the session has been restored (or the absence of one confirmed). */
  ready: false,
  session: null,
  user: null,
  profile: null,
  selection: { core: [], optional: [], saved: false },
  catalog: [],
  resources: [],
  pendingEmail: null,
  error: null,
  /** Set when a network problem prevented the profile from loading. */
  loadError: null,
};

const listeners = new Set();
let catalogLoadedAt = 0;

export function subscribeAccount(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(account); } catch (err) { console.error("[padhle] account listener failed", err); }
  }
}

function resetProfileState() {
  account.session = null;
  account.user = null;
  account.profile = null;
  account.selection = { core: [], optional: [], saved: false };
  account.error = null;
  account.loadError = null;
}

export const isSignedIn = () => Boolean(account.session?.access_token);
export const hasProfile = () => Boolean(account.profile?.username);
export const hasSelection = () => Boolean(account.selection.saved);
/** True when the signed-in student has active paid full access. */
export const hasPaidAccess = () => {
  const p = account.profile;
  return Boolean(
    p && p.plan === "full_access" && p.planExpiresAt && new Date(p.planExpiresAt) > new Date(),
  );
};
export const accountEmail = () => account.session?.user?.email || account.user?.email || "";
export const accountUsername = () => account.profile?.username || "";

/**
 * A usable access token, refreshing a session that is close to expiry first.
 * Payment verification writes to `profiles` with the student's own JWT, so it
 * must never send the stale copy that has been sitting in `account.session`
 * since the page loaded — that is a 401 and a payment that never activates.
 */
export async function accessToken() {
  const session = await getSession();
  if (session) account.session = session;
  return session?.access_token || "";
}

/** Validate a username before it reaches the network. */
export function validateUsername(value) {
  const name = String(value ?? "").trim();
  if (!name) return { ok: false, error: "Pick a username." };
  if (name.length < 3) return { ok: false, error: "Usernames need at least 3 characters." };
  if (name.length > 20) return { ok: false, error: "Usernames can be at most 20 characters." };
  if (!USERNAME_RE.test(name)) return { ok: false, error: "Use only letters, numbers and underscores — no spaces." };
  return { ok: true, value: name };
}

/** Validate an email/password pair before calling Supabase. */
function validateCredentials(email, password) {
  const address = String(email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) return { ok: false, error: "Enter a valid email address." };
  if (String(password ?? "").length < 8) return { ok: false, error: "Use a password of at least 8 characters." };
  return { ok: true, value: { email: address, password: String(password) } };
}

/* ------------------------------------------------------------------- load -- */

async function loadCatalog() {
  // Catalog + resources are public read-only content. A failure must not stop
  // sign-in, because the student's own subject rows can still render a name.
  if (account.catalog.length && Date.now() - catalogLoadedAt < 5 * 60 * 1000) return;
  try {
    const [subjects, resources] = await Promise.all([
      selectRows("subjects", "select=id,name,short_name,code,color,accent,kind,sort_order&order=sort_order.asc"),
      selectRows("subject_resources", "select=subject_id,title,summary,href,kind,sort_order&order=sort_order.asc"),
    ]);
    if (Array.isArray(subjects)) account.catalog = subjects;
    if (Array.isArray(resources)) account.resources = resources;
    catalogLoadedAt = Date.now();
  } catch (err) {
    console.warn("[account] Could not load the subject catalogue:", err?.message || err);
  }
}

async function loadProfileAndSelection() {
  let session = await getSession();
  if (!session?.access_token) {
    resetProfileState();
    return;
  }
  // A session that arrived in an email-confirmation link only carries tokens,
  // not the user object. Ask Auth who it belongs to before reading the profile.
  if (!session.user?.id) {
    await refreshUser();
    session = (await getSession()) || session;
  }
  account.session = session;
  account.user = session.user || null;

  const uid = session.user?.id;
  if (!uid) throw new Error("The account service returned a session without a user id.");

  const [profiles, rows] = await Promise.all([
    selectRows("profiles", `select=${PROFILE_FIELDS}&id=eq.${encodeURIComponent(uid)}&limit=1`),
    selectRows("profile_subjects", `select=${SELECTION_FIELDS}&user_id=eq.${encodeURIComponent(uid)}`),
  ]);

  const row = Array.isArray(profiles) ? profiles[0] : null;
  if (row) {
    account.profile = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      avatar: row.avatar,
      createdAt: row.created_at,
      plan: row.plan,
      planExpiresAt: row.plan_expires_at,
    };
  } else {
    // No profile row yet. Google OAuth users carry `app_metadata.provider`
    // (and identities/provider_data on some versions) plus user_metadata
    // with full_name/avatar_url, so we can create the profile automatically
    // without a sign-up form. Email/password users are sent to set-username
    // by gateTarget instead.
    const user = session.user || {};
    const providers = [
      user.app_metadata?.provider,
      user.identities?.[0]?.provider,
      ...(Array.isArray(user.provider_data) ? user.provider_data.map((p) => p?.provider) : []),
    ].filter(Boolean);
    const isGoogleOAuth = providers.includes("google");
    if (isGoogleOAuth) {
      const meta = user.user_metadata || {};
      // The database only accepts [A-Za-z0-9_]{3,20}; an email local part
      // such as "first.last" must be cleaned before it becomes a username.
      const emailBase = String(user.email || "").split("@")[0].replace(/[^A-Za-z0-9_]/g, "");
      const suggestedUsername = emailBase.length >= 3 ? emailBase.slice(0, 20) : `user_${uid.slice(0, 8)}`;
      const displayName = meta.full_name || meta.name || suggestedUsername;
      // profiles.avatar is an emoji, not a URL. Google's picture URL would be
      // truncated to "http" and render as a broken avatar.
      try {
        const created = await insertRows("profiles", [{
          id: uid,
          username: suggestedUsername,
          display_name: String(displayName).slice(0, 40),
          avatar: "🦉",
        }]);
        const createdRow = Array.isArray(created) ? created[0] : null;
        if (createdRow) {
          account.profile = {
            id: createdRow.id,
            username: createdRow.username,
            displayName: createdRow.display_name,
            avatar: createdRow.avatar,
            createdAt: createdRow.created_at,
          };
        }
      } catch (err) {
        // Username may be taken (unique index on lower(username)) or another
        // transient error. Leave profile null; the profile step will handle it.
        console.warn("[account] Could not auto-create profile:", err?.message || err);
      }
    }
    // Not Google OAuth and no profile: gateTarget will redirect to set-username.
  }

  const list = Array.isArray(rows) ? rows : [];
  const core = list.filter((r) => r.kind === "core").map((r) => r.subject_id);
  const optional = list.filter((r) => r.kind === "optional").map((r) => r.subject_id);
  account.selection = {
    // The flat list is authoritative; `core`/`optional` remain for compatibility.
    subjects: [...core, ...optional],
    core,
    optional,
    // The presence of any row means the student has completed the step. An
    // empty optional list is a valid, saved choice.
    saved: list.length > 0,
  };
}

/**
 * Restore the session at boot. Never throws: a network failure is stored on
 * `account.loadError` so the setup screen can offer a retry instead of
 * trapping the visitor in a loading state.
 */
export async function initAccount({ force = false } = {}) {
  if (account.ready && !force && account.session) return account;
  account.error = null;
  account.loadError = null;
  // A confirmation / magic link lands here with tokens in the URL fragment.
  consumeAuthCallback();
  try {
    const session = await getSession();
    if (!session?.access_token) {
      resetProfileState();
    } else {
      await loadProfileAndSelection();
      await loadCatalog();
    }
  } catch (err) {
    // Expired sessions are expected; anything else is shown as a retryable error.
    if (err?.status === 401) {
      clearSession();
      resetProfileState();
    } else {
      account.loadError = err?.message || "Could not load your profile.";
    }
  } finally {
    account.ready = true;
    emit();
  }
  return account;
}

/* ------------------------------------------------------------------- auth -- */

export async function signUpAccount(email, password, { username } = {}) {
  const v = validateCredentials(email, password);
  if (!v.ok) throw new Error(v.error);
  let name = "";
  if (username !== undefined && username !== null && String(username).trim()) {
    const u = validateUsername(username);
    if (!u.ok) throw new Error(u.error);
    name = u.value;
  }
  const metadata = { app: "padhle-wtf" };
  if (name) metadata.username = name;
  const result = await signUpWithPassword(v.value.email, v.value.password, metadata);
  account.pendingEmail = result.needsConfirmation ? v.value.email : null;
  // Remember the chosen username until the profile is actually created. With
  // email confirmation this survives the inbox round-trip; with an immediate
  // session it survives a page reload on the profile step.
  if (name) savePendingSignup({ email: v.value.email, username: name });
  else clearPendingSignup();
  if (result.session) await initAccount({ force: true });
  emit();
  return result;
}

export async function signInAccount(email, password) {
  const address = String(email ?? "").trim();
  if (!address || !password) throw new Error("Enter your email and password.");
  await signInWithPassword(address, password);
  account.pendingEmail = null;
  await initAccount({ force: true });
  return account;
}

/**
 * Start Google OAuth sign-in. Redirects the browser to Supabase's authorize
 * endpoint; Supabase sends the user to Google, then back to the app. On return
 * the session is restored and initAccount() loads (or creates) the profile.
 */
export async function signInWithGoogleOAuth() {
  await signInWithGoogle();
}

export async function resetPassword(email) {
  const address = String(email ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error("Enter a valid email address.");
  }
  await resetPasswordForEmail(address);
}

export async function signOutAccount() {
  try { await supabaseSignOut(); } finally {
    resetProfileState();
    account.pendingEmail = null;
    catalogLoadedAt = 0;
    emit();
  }
}

/** Remember (or forget) the address waiting for email confirmation. */
export function setPendingEmail(email) {
  account.pendingEmail = String(email || "").trim() || null;
  emit();
}

export function clearPendingEmail() {
  account.pendingEmail = null;
  emit();
}

/* -------------------------------------------------------- pending signup -- */
/**
 * With email confirmation enabled, sign-up returns no session. Keep the
 * username the visitor already chose so the profile step can pre-fill it after
 * they confirm and log in.
 */
export function pendingSignup() {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_SIGNUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function savePendingSignup(value) {
  try {
    if (value) globalThis.localStorage?.setItem(PENDING_SIGNUP_KEY, JSON.stringify(value));
    else globalThis.localStorage?.removeItem(PENDING_SIGNUP_KEY);
  } catch {
    // Storage can be unavailable in private mode; the current tab still works.
  }
}

export function clearPendingSignup() {
  savePendingSignup(null);
}

/* ---------------------------------------------------------------- profile -- */

/** Live availability check. Returns `{ ok, available, error }`. */
export async function checkUsernameAvailability(value) {
  const v = validateUsername(value);
  if (!v.ok) return { ok: false, available: false, error: v.error };
  try {
    const available = await callRpc("username_available", { candidate: v.value });
    return { ok: true, available: available === true, error: available === true ? null : "That username is already taken." };
  } catch (err) {
    // A failed check is not a failed username; the final INSERT is authoritative.
    return { ok: true, available: null, error: null, warning: err?.message || "Could not check that username right now." };
  }
}

/**
 * Create the profile row for the signed-in user.
 *
 * The database has a unique index on `lower(username)`, so two simultaneous
 * claims for the same name cannot both succeed — the loser gets a 23505 and is
 * shown "That username is already taken." This is the authoritative check; the
 * live availability call above is only a convenience.
 */
export async function createProfile({ username, displayName, avatar }) {
  if (!isSignedIn()) throw new Error("Sign in again to finish your profile.");
  const v = validateUsername(username);
  if (!v.ok) throw new Error(v.error);
  const name = String(displayName ?? "").trim().slice(0, 40) || v.value;
  const face = String(avatar ?? "").trim().slice(0, 4) || "🦉";
  const uid = account.session.user?.id;
  if (!uid) throw new Error("The account service returned a session without a user id.");

  if (account.profile) {
    // Editing an existing profile: update in place.
    const rows = await updateRows("profiles", `id=eq.${encodeURIComponent(uid)}`, {
      username: v.value, display_name: name, avatar: face, updated_at: new Date().toISOString(),
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (row) account.profile = { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar, createdAt: row.created_at };
    emit();
    return account.profile;
  }

  const rows = await insertRows("profiles", [{
    id: uid, username: v.value, display_name: name, avatar: face,
  }]);
  const row = Array.isArray(rows) ? rows[0] : null;
  account.profile = row
    ? { id: row.id, username: row.username, displayName: row.display_name, avatar: row.avatar, createdAt: row.created_at }
    : { id: uid, username: v.value, displayName: name, avatar: face };
  clearPendingSignup();
  emit();
  return account.profile;
}

/* --------------------------------------------------------------- subjects -- */

/**
 * Save the chosen compulsory + elective subjects through the `set_subject_selection`
 * RPC, which re-validates the list and replaces the rows in one transaction.
 * The server is always the source of truth for the selection.
 */
export async function saveSubjectSelection(coreIds, optionalIds) {
  if (!isSignedIn()) throw new Error("Sign in again to choose your subjects.");
  if (!hasProfile()) throw new Error("Finish your profile before choosing subjects.");
  const v = validateSubjectSelection(coreIds, optionalIds);
  if (!v.ok) throw new Error(v.error);
  await callRpc("set_subject_selection", { p_core: v.value.core, p_optional: v.value.optional });
  const rows = await selectRows("profile_subjects", `select=${SELECTION_FIELDS}&user_id=eq.${encodeURIComponent(account.session.user.id)}`);
  const list = Array.isArray(rows) ? rows : [];
  const core = list.filter((r) => r.kind === "core").map((r) => r.subject_id);
  const optional = list.filter((r) => r.kind === "optional").map((r) => r.subject_id);
  account.selection = {
    subjects: [...core, ...optional],
    core,
    optional,
    saved: list.length > 0,
  };
  emit();
  return account.selection;
}

/* ------------------------------------------------------- account settings -- */

function settingsRow(patch, uid) {
  const row = { user_id: uid };
  for (const [key, column] of Object.entries(SETTINGS_COLUMNS)) {
    if (patch[key] === undefined) continue;
    const value = patch[key];
    if (key === "studyDays") {
      row[column] = Array.isArray(value)
        ? value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        : [];
    } else if (key === "targetDate") {
      row[column] = value ? String(value) : null;
    } else if (key === "dailyTargetMin" || key === "availableTodayMin" || key === "dueWarnDays") {
      row[column] = Math.max(0, Number(value) || 0);
    } else if (key === "reduceMotion" || key === "reminderEnabled" || key === "notifyTimerEnd") {
      row[column] = Boolean(value);
    } else {
      row[column] = value;
    }
  }
  return row;
}

function settingsPatch(row) {
  const patch = {};
  for (const [key, column] of Object.entries(SETTINGS_COLUMNS)) {
    if (row[column] === undefined) continue;
    let value = row[column];
    if (key === "studyDays") {
      value = Array.isArray(value)
        ? value.map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
        : [];
    } else if (key === "targetDate") {
      value = value || null;
    }
    patch[key] = value;
  }
  return patch;
}

/**
 * Read the signed-in student's preferences. Returns null when the row has not
 * been created yet (a brand-new account), so the caller can seed it.
 */
export async function loadUserSettings() {
  if (!isSignedIn()) return null;
  const uid = account.session?.user?.id || account.user?.id;
  if (!uid) return null;
  const rows = await selectRows(
    "user_settings",
    `select=${SETTINGS_FIELDS}&user_id=eq.${encodeURIComponent(uid)}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? settingsPatch(row) : null;
}

/**
 * Upsert the signed-in student's preferences. RLS guarantees that the only row
 * a JWT can write is its own; `user_id` is still sent explicitly so a direct
 * PostgREST call is as safe as the UI path.
 */
export async function saveUserSettings(patch) {
  if (!isSignedIn()) return null;
  const uid = account.session?.user?.id || account.user?.id;
  if (!uid) return null;
  const rows = await upsertRows("user_settings", [settingsRow(patch, uid)], "user_id");
  const row = Array.isArray(rows) ? rows[0] : null;
  return row ? settingsPatch(row) : null;
}

/**
 * Clear the account-owned data (subject selection and preferences) while keeping
 * the identity, username and email. The caller clears the device's study data.
 */
export async function resetAccountData() {
  if (!isSignedIn()) throw new Error("Sign in to reset your account data.");
  await callRpc("reset_account_data");
  account.selection = { core: [], optional: [], saved: false };
  emit();
  return true;
}

/**
 * Permanently delete the signed-in account. The database function runs as its
 * owner and removes the auth user; profiles, subjects and settings cascade.
 * After this resolves the local session is no longer valid.
 */
export async function deleteAccount() {
  if (!isSignedIn()) throw new Error("Sign in to delete your account.");
  await callRpc("delete_account");
  clearSession();
  resetProfileState();
  account.pendingEmail = null;
  clearPendingSignup();
  catalogLoadedAt = 0;
  emit();
  return true;
}

/* ------------------------------------------------------------------ utils -- */

