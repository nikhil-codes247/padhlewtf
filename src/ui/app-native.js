/**
 * app-native.js — Android shell bridge connection.
 *
 * Re-arms the daily reminder on every open and wires the permission-change
 * callback for native WebView hosts. Uses shared state from app-state.js
 * (store) and functions from core/reminders.js and core/native.js.
 */
import { store } from "../core/store.js";
import { isNative } from "../core/native.js";
import { syncDailyReminder } from "../core/reminders.js";
import { renderRoute } from "../app.js";

export function connectNativeShell() {
  // Re-arm the reminder on every open. In a browser this schedules the in-page
  // Notification while the tab is open; in the Android shell it arms an alarm.
  syncDailyReminder(store);
  if (!isNative()) return;
  window.__padhlePermissionChanged = () => renderRoute("permission");
}
