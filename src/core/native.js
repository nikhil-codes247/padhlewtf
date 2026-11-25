/**
 * native.js — the optional bridge to the Android shell (see ../android).
 *
 * In a plain browser the bridge does not exist, so every function here reports
 * "not native" and quietly does nothing. That is deliberate: the web app must
 * never *depend* on the shell, because the same source has to run in Chrome and
 * inside the APK. Nothing in this file may import from the store or a view.
 *
 * The shell injects the bridge before the page loads, so it is available from
 * the first line of app.js onwards. Every call is wrapped in try/catch: a
 * misbehaving bridge degrades to "browser behaviour", never to a crash.
 *
 * `window.Padhle` is the historic shell contract. `window.PADHLE_WTF` is the
 * new name; both are accepted so older APK builds keep working during the
 * rebrand.
 */

const bridge = () => (
  typeof window !== "undefined"
    ? (window.PADHLE_WTF || window.Padhle)
    : undefined
);

/** True only inside the Android app. */
export function isNative() {
  try {
    const api = bridge();
    return !!api && typeof api.platform === "function";
  } catch {
    return false;
  }
}

/** Identity of the shell, for the About panel and the Settings copy. */
export function nativeInfo() {
  if (!isNative()) return { native: false, platform: "browser" };
  return {
    native: true,
    platform: String(call("platform", "android")),
    appVersion: String(call("appVersion", "")),
    sdkInt: Number(call("sdkInt", 0)) || 0,
    debug: !!call("isDebug", false),
  };
}

/** Calls a bridge method, swallowing anything that goes wrong. */
function call(fn, fallback, ...args) {
  try {
    const api = bridge();
    if (!api || typeof api[fn] !== "function") return fallback;
    return api[fn](...args);
  } catch (err) {
    console.warn(`[padhle] native ${fn}() failed`, err);
    return fallback;
  }
}

/* ------------------------------------------------------------------ shell -- */

/** Keeps the Android status/navigation bars in step with the app's theme. */
export function nativeTheme(theme) {
  call("setTheme", null, theme === "dark" ? "dark" : "light");
}

export function nativeToast(message) {
  call("toast", null, String(message));
}

/* ---------------------------------------------------------- notifications -- */

/** "granted" | "prompt" | "denied" | "off" | "unsupported". */
export function notificationState() {
  if (!isNative()) return "unsupported";
  return String(call("notificationState", "unsupported"));
}

export function requestNotifications() {
  if (!isNative()) return "unsupported";
  return String(call("requestNotifications", "unsupported"));
}

/** Post a notification immediately (the Settings "send a test" button). */
export function notify(title, body) {
  call("notify", null, String(title), String(body));
}

/** Parses "HH:MM" into { hour, minute }, or null. */
export function parseClock(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value || "").trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

/** Arm or clear the daily nudge. `body` is baked into the alarm, so pass fresh text. */
export function setDailyReminder(enabled, timeHHMM, title, body) {
  if (!isNative()) return false;
  const clock = parseClock(timeHHMM);
  if (enabled && clock) call("scheduleDailyReminder", null, clock.hour, clock.minute, String(title), String(body));
  else call("cancelDailyReminder", null);
  return true;
}

/* --------------------------------------------------------------- the timer -- */

/**
 * One notification for the end of the running study block. It is a system
 * alarm, not a JavaScript timer, so it still fires when the app is in the
 * background or the screen is off.
 */
export function setTimerEndAlarm(atMillis, title, body) {
  if (!isNative()) return false;
  const at = Number(atMillis);
  if (!Number.isFinite(at) || at <= Date.now()) { call("cancelTimerEnd", null); return true; }
  call("scheduleTimerEnd", null, Math.round(at), String(title), String(body));
  return true;
}

export function clearTimerEndAlarm() {
  if (!isNative()) return false;
  call("cancelTimerEnd", null);
  return true;
}

/* ------------------------------------------------------------------ files -- */

/**
 * Saves text through Android's own "save as" picker, which is how the app
 * writes a backup without holding any storage permission.
 *
 * @returns {boolean} true when the shell has taken over, in which case the
 *                    caller must NOT also run the browser download path.
 */
export function saveTextFile(name, mime, text) {
  if (!isNative()) return false;
  call("saveTextFile", null, String(name), String(mime), String(text));
  return true;
}
