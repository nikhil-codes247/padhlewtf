/**
 * settings.js — the account and preference surface.
 *
 * Sections, in the order students need them:
 *   1. Theme            — the existing light/dark system plus reduced motion
 *   2. Reminders        — daily study nudge + timer-end notification
 *   3. Daily Targets    — minutes, exam date, available time and study days
 *   4. Account          — identity, reset and permanent deletion
 *   5. Study data       — one clearly-labelled, confirmed clear-data action
 *
 * Backup/export was removed from this surface by request; only the destructive
 * "clear study data" control remains, and it always asks for confirmation.
 */
import { esc } from "../dom.js?v=mwz1jos9";
import { chip, sectionCard } from "../components.js?v=mwz1jos9";
import { brand, TAGLINE } from "../../core/branding.js?v=mwz1jos9";
import { account, accountEmail, accountUsername, isSignedIn } from "../../core/account.js?v=mwz1jos9";
import { isNative } from "../../core/native.js?v=mwz1jos9";
import { notificationsSupported, reminderPermission } from "../../core/reminders.js?v=mwz1jos9";
import accountView from "./account.js?v=mwz1jos9";

const DAY_NAMES = [
  ["1", "Mon"],
  ["2", "Tue"],
  ["3", "Wed"],
  ["4", "Thu"],
  ["5", "Fri"],
  ["6", "Sat"],
  ["0", "Sun"],
];

const permissionCopy = (state) => (
  state === "granted" ? "Notifications are allowed."
    : state === "denied" ? "Notifications are blocked in your browser or system settings."
      : state === "unsupported" ? "Notifications are not supported in this browser."
        : "Notifications are not allowed yet."
);

function themeCard(s) {
  return sectionCard({
    cls: "stripe tight",
    title: "Theme",
    subtitle: "Choose the look that helps you focus.",
    body: `<form data-form="settings-theme" novalidate class="stack gap-3">
      <div class="field">
        <label for="set-theme">Theme</label>
        <select class="select" id="set-theme" name="theme">
          <option value="light"${s.theme === "light" ? " selected" : ""}>Light — paper &amp; ink</option>
          <option value="dark"${s.theme === "dark" ? " selected" : ""}>Dark — charcoal &amp; cream ink</option>
        </select>
        <div class="field-hint">Your choice is applied immediately and remembered for this account.</div>
      </div>
      <label class="check"><input type="checkbox" name="reduceMotion" ${s.reduceMotion ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="label-text small">Reduce animations</span></label>
      <div class="row wrap gap-2">
        <button class="btn primary" type="submit">Save theme</button>
        <button class="btn" type="button" data-act="theme-toggle">Toggle now</button>
        <span class="small muted">Synced to your account.</span>
      </div>
    </form>`,
  });
}

function reminderCard(s) {
  const browser = !isNative();
  const state = reminderPermission();
  const supported = notificationsSupported();
  return sectionCard({
    cls: "stripe tight",
    title: "Reminders",
    subtitle: "A daily nudge to protect your study block.",
    body: `<form data-form="reminders" novalidate class="stack gap-3">
      <label class="check"><input type="checkbox" name="reminderEnabled" ${s.reminderEnabled ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="label-text small">Daily study reminder</span></label>
      <div class="field">
        <label for="set-remtime">Reminder time</label>
        <input class="input" id="set-remtime" name="reminderTime" type="time" value="${esc(s.reminderTime || "19:30")}">
        <div class="field-hint">The reminder text is built from today's real plan, so it stays useful.</div>
      </div>
      <label class="check"><input type="checkbox" name="notifyTimerEnd" ${s.notifyTimerEnd ? "checked" : ""}><span class="box" aria-hidden="true"></span><span class="label-text small">Notify me when a study block ends</span></label>
      <div class="row wrap gap-2">
        <button class="btn primary" type="submit">Save reminders</button>
        ${supported ? `<button class="btn" type="button" data-act="notifications-request">${state === "granted" ? "Notifications allowed" : "Allow notifications"}</button>
        <button class="btn" type="button" data-act="notifications-test">Send test</button>` : ""}
      </div>
      <div class="field-hint">${browser
        ? "In the browser, reminders appear while PADHLE.WTF is open in a tab. Allow notifications for this site to receive them."
        : "Reminders are delivered by the Android app, even when the screen is off."}</div>
      <div class="small ${state === "granted" ? "ok-text" : state === "denied" ? "bad-text" : "muted"}">${esc(permissionCopy(state))}</div>
    </form>`,
  });
}

function targetsCard(s) {
  const days = new Set((s.studyDays || []).map(Number));
  return sectionCard({
    cls: "stripe tight",
    title: "Daily Targets",
    subtitle: "Used by the dashboard, planner and recommendations.",
    body: `<form data-form="settings-targets" novalidate class="stack gap-3">
      <div class="grid-2 gap-3">
        <div class="field">
          <label for="set-daily">Daily study target (minutes)</label>
          <input class="input" id="set-daily" name="dailyTargetMin" type="number" min="0" max="1440" step="10" value="${esc(s.dailyTargetMin ?? 230)}">
          <div class="field-hint">Default ≈230 minutes on weekdays.</div>
        </div>
        <div class="field">
          <label for="set-available">Minutes available today</label>
          <input class="input" id="set-available" name="availableTodayMin" type="number" min="0" max="1440" step="10" value="${esc(s.availableTodayMin ?? 180)}">
          <div class="field-hint">Used to keep the day's plan realistic.</div>
        </div>
      </div>
      <div class="field">
        <label for="set-target">Exam / target date</label>
        <input class="input" id="set-target" name="targetDate" type="date" value="${esc(s.targetDate || "")}">
        <div class="field-hint">Defaults to 7 Feb 2027.</div>
      </div>
      <div class="field">
        <label>Study days</label>
        <div class="row wrap gap-2">
          ${DAY_NAMES.map(([value, label]) => `<label class="check"><input type="checkbox" name="studyDays" value="${value}"${days.has(Number(value)) ? " checked" : ""}><span class="box" aria-hidden="true"></span><span class="label-text small">${label}</span></label>`).join("")}
        </div>
        <div class="field-hint">Planner load is spread across these days.</div>
      </div>
      <div class="row wrap gap-2">
        <button class="btn primary" type="submit">Save targets</button>
        <span class="small muted">Synced to your account.</span>
      </div>
    </form>`,
  });
}

function accountCard() {
  const signed = isSignedIn();
  const p = account.profile;
  const email = accountEmail();
  const username = accountUsername();

  if (!signed) {
    return sectionCard({
      cls: "stripe tight",
      title: "Account",
      subtitle: "Identity, data and destructive actions.",
      body: `<div class="callout info"><b>You're signed out.</b> Sign in to keep your subjects, theme, preferences and every study record — planner tasks, ticks, sessions and notes — synced to your account across devices. Without an account there is nowhere to store them.</div>
      <div class="row wrap gap-2 mt-4">
        <a class="btn" href="#/login">Log in</a>
        <a class="btn primary" href="#/signup">Create account</a>
      </div>`,
    });
  }

  return sectionCard({
    cls: "stripe tight",
    title: "Account",
    subtitle: "Identity, data and destructive actions.",
    body: `<div class="row wrap gap-3" style="align-items:center">
      <span class="account-avatar" aria-hidden="true">${esc(p?.avatar || "🦉")}</span>
      <div class="grow" style="min-width:220px">
        <h3 style="margin:0">${esc(p?.displayName || "Student")}</h3>
        <div class="small muted">@${esc(username || "—")} · ${esc(email || "—")}</div>
      </div>
      ${chip("signed in", "ok")}
    </div>
    <div class="callout info mt-4">Theme, reminders, daily targets and all your study records are saved to your account — planner tasks, ticks, sessions, revisions and notes included. Clearing this browser's site data does not delete any of it.</div>
    <div class="row wrap gap-2 mt-4">
      <button class="btn danger" type="button" data-act="account-reset-data">Reset account data</button>
      <button class="btn red" type="button" data-act="account-delete">Delete account</button>
    </div>
    <div class="field-hint mt-2">Reset clears your subjects, preferences and study data but keeps your login. Delete removes your account, username, subjects, preferences and study data permanently.</div>`,
  });
}

function dataCard() {
  return sectionCard({
    cls: "stripe tight",
    title: "Study data",
    subtitle: "Your sessions, notes, planner and progress.",
    body: `<div class="settings-danger">
      <div class="settings-danger-copy">
        <b>Clear my study data</b>
        <p class="small muted">Removes every study session, revision, note, planner task and completion tick. Your syllabus, subjects, chapters and tags stay. You will be asked to confirm first.</p>
      </div>
      <button class="btn danger" type="button" data-act="clear-study">Clear study data</button>
    </div>`,
  });
}

export default {
  id: "settings",
  title: "Settings",

  render(ctx) {
    const s = ctx.store.state.settings;
    return [
      sectionCard({
        cls: "tight",
        body: `<div class="row wrap between gap-3">
          <div>
            <span class="eyebrow">${esc(brand())} · ${esc(TAGLINE)}</span>
            <h1 style="margin:4px 0 0">Settings</h1>
            <p class="small muted" style="margin:0">Theme, reminders, daily targets and account controls.</p>
          </div>
          <div>${chip("account synced", "ok")}</div>
        </div>`,
      }),
      themeCard(s),
      reminderCard(s),
      targetsCard(s),
      accountCard(),
      // The full account surface (sign-in, profile, subject choices, privacy)
      // is embedded here too.
      accountView.render(ctx),
      dataCard(),
    ].join("");
  },

  async mount(ctx) {
    try {
      if (typeof accountView.mount === "function") await accountView.mount(ctx);
    } catch { /* the embedded account view stands on its own */ }
  },
};
