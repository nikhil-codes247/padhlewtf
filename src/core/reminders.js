/**
 * reminders.js — the app's reminder *policy*.
 *
 * `native.js` is the mechanism inside the Android shell; this file decides what
 * a reminder says and when it should exist. It also provides a browser fallback:
 * while PADHLE.WTF is open and the student has allowed notifications, a daily
 * Notification is scheduled at the chosen time. The preference itself lives in
 * the account settings and survives across devices.
 */
import {
  isNative, setDailyReminder, setTimerEndAlarm, clearTimerEndAlarm,
  parseClock, notificationState as nativeNotificationState,
  requestNotifications as nativeRequestNotifications,
  notify as nativeNotify,
} from "./native.js?v=mwz6nuk5";
import { todayISO } from "./dates.js?v=mwz6nuk5";

/**
 * Clearing the end-of-block alarm is a plain mechanism, but the callers are all
 * thinking in terms of "reminders", so it is re-exported here to keep one import
 * site for the whole feature.
 */
export { clearTimerEndAlarm };

export const REMINDER_TITLE = "Time to study";

/**
 * The text is baked into the alarm when it is scheduled, so it is composed from
 * today's real plan and refreshed every time the app is opened — a nudge that
 * says "3 tasks planned" is worth more than a generic one.
 */
export function reminderBody(store) {
  const open = store.plannerOn(todayISO()).filter((t) => !t.done);
  const due = store.derived?.revisionDue?.length ?? 0;
  const bits = [];
  if (open.length) bits.push(`${open.length} task${open.length === 1 ? "" : "s"} planned`);
  if (due) bits.push(`${due} chapter${due === 1 ? "" : "s"} due for revision`);
  return bits.length ? `Today: ${bits.join(", ")}.` : "Open the app and start today's session.";
}

/* --------------------------------------------------------- permissions ---- */

export function notificationsSupported() {
  return isNative() || typeof Notification !== "undefined";
}

/** "granted" | "prompt" | "denied" | "unsupported". */
export function reminderPermission() {
  if (isNative()) return nativeNotificationState();
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission === "granted"
    ? "granted"
    : Notification.permission === "denied"
      ? "denied"
      : "prompt";
}

/** Ask for permission. Must be called from a user gesture on the web. */
export async function requestReminderPermission() {
  if (isNative()) return nativeRequestNotifications();
  if (typeof Notification === "undefined") return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return "denied";
  }
}

/** Send a one-off notification through whichever mechanism is available. */
export function sendTestReminder(store) {
  const body = reminderBody(store);
  if (isNative()) {
    nativeNotify(REMINDER_TITLE, body);
    return true;
  }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return false;
  try {
    new Notification(REMINDER_TITLE, { body, tag: "padhle-wtf-test" });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------ scheduling -- */

let browserTimer = null;
let browserArmedFor = "";

function scheduleBrowserReminder(store) {
  clearTimeout(browserTimer);
  browserTimer = null;
  browserArmedFor = "";
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

  const s = store?.state?.settings;
  if (!s?.reminderEnabled) return;
  const clock = parseClock(s.reminderTime);
  if (!clock) return;

  const now = new Date();
  const next = new Date(now);
  next.setHours(clock.hour, clock.minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);

  const delay = Math.min(next.getTime() - now.getTime(), 24 * 60 * 60 * 1000);
  browserArmedFor = next.toISOString();
  browserTimer = setTimeout(() => {
    try {
      new Notification(REMINDER_TITLE, { body: reminderBody(store), tag: "padhle-wtf-daily" });
    } catch {
      // Permission may have been revoked while the tab was open.
    }
    scheduleBrowserReminder(store);
  }, delay);
  // Node's timers expose unref(); browsers do not. This keeps unit tests from
  // waiting a day for a notification timer they never asked to fire.
  browserTimer?.unref?.();
}

/** Arms or clears the daily nudge to match the current settings. */
export function syncDailyReminder(store) {
  const s = store.state.settings;
  if (isNative()) {
    setDailyReminder(!!s.reminderEnabled, s.reminderTime, REMINDER_TITLE, reminderBody(store));
    return true;
  }
  scheduleBrowserReminder(store);
  return true;
}

/**
 * Keeps the end-of-block alarm in step with the running timer. A paused, stopped
 * or disabled timer clears it. Called on every timer transition, so the alarm can
 * never disagree with what the Timer screen shows.
 */
export function syncTimerAlarm(store, blockMinutes = 30) {
  if (!isNative()) return;
  const s = store.state.settings;
  const t = s.timer;
  if (!s.notifyTimerEnd || !t?.running || t.paused || !t.startedAt) {
    clearTimerEndAlarm();
    return;
  }
  const started = new Date(t.startedAt).getTime();
  const at = started + Math.max(1, Number(blockMinutes) || 30) * 60000;
  setTimerEndAlarm(at, "Study block finished", "Open the app to log the session or start another block.");
}

/** Whether a running block *should* have an alarm — used for the Settings copy. */
export function timerAlarmWanted(store) {
  const s = store.state.settings;
  const t = s.timer;
  return !!s.notifyTimerEnd && !!t?.running && !t.paused;
}
