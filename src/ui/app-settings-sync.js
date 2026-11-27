/**
 * app-settings-sync.js — account preference sync.
 *
 * Pulls account settings from Supabase on sign-in, and pushes local changes
 * back after a short debounce. Uses shared state from app-state.js (store,
 * ctx) and functions from core/account.js.
 */
import { store } from "../core/store.js?v=mwz6nuk5";
import { isSignedIn, loadUserSettings, saveUserSettings } from "../core/account.js?v=mwz6nuk5";
import { syncDailyReminder } from "../core/reminders.js?v=mwz6nuk5";

const REMOTE_SETTINGS_KEYS = [
  "theme", "reduceMotion", "reminderEnabled", "reminderTime", "notifyTimerEnd",
  "dailyTargetMin", "targetDate", "studyDays", "availableTodayMin", "dueWarnDays",
];

let remoteSettingsReady = false;
let remoteSettingsBusy = false;
let lastSyncedSettings = "";
let settingsPushTimer = null;

export { remoteSettingsReady, remoteSettingsBusy, lastSyncedSettings, settingsPushTimer };

function remoteSettingsSnapshot() {
  const out = {};
  for (const key of REMOTE_SETTINGS_KEYS) out[key] = store.state.settings?.[key] ?? null;
  return out;
}

function remoteSettingsKey(snapshot = remoteSettingsSnapshot()) {
  return JSON.stringify(snapshot);
}

/**
 * Pull the account's preferences once per signed-in session. If the account has
 * no row yet, create it from the current values so nothing is lost.
 */
export async function hydrateRemoteSettings() {
  if (!isSignedIn() || remoteSettingsReady || remoteSettingsBusy) return;
  remoteSettingsBusy = true;
  try {
    const remote = await loadUserSettings();
    if (remote) {
      await store.setSettings(remote);
      lastSyncedSettings = remoteSettingsKey();
    } else {
      const snapshot = remoteSettingsSnapshot();
      await saveUserSettings(snapshot);
      lastSyncedSettings = remoteSettingsKey(snapshot);
    }
    remoteSettingsReady = true;
    syncDailyReminder(store);
  } catch (err) {
    // The table may not be migrated yet, or the network may be down. The
    // preferences stay as they are and the next sign-in retries the sync.
    console.warn("[padhle] account preferences could not be loaded; using this device's copy", err);
  } finally {
    remoteSettingsBusy = false;
  }
}

/** Push changed preferences shortly after the local store settles. */
export function scheduleSettingsPush() {
  if (!remoteSettingsReady || !isSignedIn()) return;
  const snapshot = remoteSettingsSnapshot();
  const key = remoteSettingsKey(snapshot);
  if (key === lastSyncedSettings) return;
  clearTimeout(settingsPushTimer);
  settingsPushTimer = setTimeout(async () => {
    try {
      await saveUserSettings(snapshot);
      lastSyncedSettings = key;
    } catch (err) {
      console.warn("[padhle] preference sync failed", err);
    }
  }, 350);
}

export function resetSettingsSync() {
  remoteSettingsReady = false;
  remoteSettingsBusy = false;
  lastSyncedSettings = "";
  clearTimeout(settingsPushTimer);
  settingsPushTimer = null;
}
