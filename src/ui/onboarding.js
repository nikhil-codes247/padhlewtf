/**
 * onboarding.js — the one-time welcome tour for a brand-new PADHLE.WTF install.
 *
 * It is only ever shown when `settings.onboarded` is false, and an install that
 * predates it is marked as already welcomed during boot, so nothing changes for a
 * returning student. Every answer the student gives here is written straight into
 * the same local database the rest of the app uses — there is no throwaway state.
 */
import { esc } from "./dom.js";
import { subjectMark } from "./components.js";
import { todayISO } from "../core/dates.js";
import { brand, TAGLINE } from "../core/branding.js";
import { account, isSignedIn, accountEmail } from "../core/account.js";
import { ALL_SUBJECT_IDS, CORE_SUBJECT_IDS, SUBJECT_MIN } from "../core/subjects.js";
import { currentSelection } from "./selection.js";

export const ONBOARDING_STEPS = 4;

export const AVATARS = ["🦉", "🐯", "🦊", "🐼", "🐧", "🚀", "⚡", "🌟", "📚", "🎯", "🧠", "🔥"];

const FEATURES = [
  { ico: "▤", label: "Full syllabus", note: "every subject, chapter and topic" },
  { ico: "▦", label: "Daily planner", note: "a ready-made 60-day plan" },
  { ico: "◷", label: "Study timer", note: "sessions that add up" },
  { ico: "↻", label: "Revision ladder", note: "+1 · +3 · +7 · +21 · +45 days" },
  { ico: "✦", label: "XP & streaks", note: "levels, badges and daily quests" },
  { ico: "▥", label: "PYQ insights", note: "what past papers actually asked" },
];

const blurb = "Your whole Class 10 syllabus — tracking, planning, timed sessions, revision, streaks and past-paper analysis — designed to make studying feel worth it.";

function featureGrid() {
  return `<div class="onb-grid">${FEATURES.map((f) => `
    <div class="onb-feature">
      <span class="onb-feature-ico" aria-hidden="true">${f.ico}</span>
      <b>${esc(f.label)}</b>
      <span class="xs faint">${esc(f.note)}</span>
    </div>`).join("")}</div>`;
}

function stepWelcome(ui) {
  return `<div class="onb-stage" data-stage="welcome">
    <div class="onb-orb o1" aria-hidden="true"></div>
    <div class="onb-orb o2" aria-hidden="true"></div>
    <div class="onb-float" aria-hidden="true">✦</div>
    <div class="onb-float f2" aria-hidden="true">★</div>
    <div class="onb-float f3" aria-hidden="true">◆</div>
    <div class="onb-logo">${esc(brand())}</div>
    <h1 class="onb-title">${esc(brand())}, <span class="onb-accent">and it actually adds up.</span></h1>
    <p class="onb-lead">${esc(blurb)}</p>
    ${featureGrid()}
    <div class="onb-actions">
      <button type="button" class="btn primary onb-big" data-act="onb-next">Let's set you up <span aria-hidden="true">→</span></button>
      <button type="button" class="btn ghost" data-act="onb-skip">Skip the tour</button>
    </div>
    <p class="xs faint">${isSignedIn() ? `Signed in as ${esc(account.profile?.username ? "@" + account.profile.username : accountEmail())}.` : `Explore first — sign in later to sync your preferences. ${esc(TAGLINE)}`}</p>
  </div>`;
}

function stepProfile(ui) {
  const s = ui._onb || {};
  const avatar = s.avatar || "🦉";
  return `<div class="onb-stage" data-stage="profile">
    <div class="onb-step">Step 2 of ${ONBOARDING_STEPS}</div>
    <h1 class="onb-title">Make it yours, <span class="onb-accent">${esc(s.displayName || "friend")}</span>.</h1>
    <p class="onb-lead">These power your streak, level and share cards. You can change any of it later.</p>
    <form data-form="onboarding" class="onb-form" novalidate>
      <div class="field">
        <label for="onb-name">What should we call you?</label>
        <input class="input" id="onb-name" name="displayName" value="${esc(s.displayName || "")}" placeholder="Your first name" maxlength="40" autocomplete="given-name">
      </div>
      <div class="field">
        <label>Pick an avatar</label>
        <div class="onb-avatars" role="radiogroup" aria-label="Choose an avatar">
          ${AVATARS.map((a) => `<label class="onb-avatar ${a === avatar ? "on" : ""}">
            <input type="radio" name="avatar" value="${esc(a)}" ${a === avatar ? "checked" : ""}><span aria-hidden="true">${esc(a)}</span>
          </label>`).join("")}
        </div>
      </div>
      <div class="grid-2">
        <div class="field"><label for="onb-target">First exam / target date</label>
          <input class="input" id="onb-target" name="targetDate" type="date" value="${esc(s.targetDate || "2027-02-07")}"></div>
        <div class="field"><label for="onb-daily">Daily study target (minutes)</label>
          <input class="input" id="onb-daily" name="dailyTargetMin" type="number" min="0" max="1440" step="10" value="${esc(s.dailyTargetMin ?? 230)}">
          <div class="field-hint">A rough goal — around 230 minutes on a weekday.</div></div>
      </div>
      <div class="onb-actions">
        <button type="button" class="btn" data-act="onb-back">← Back</button>
        <button type="submit" class="btn primary onb-big">Continue <span aria-hidden="true">→</span></button>
      </div>
    </form>
  </div>`;
}

function subjectRow(store, id, { checked = false } = {}) {
  const s = store.subject?.(id);
  const name = s?.name || id;
  const meta = s ? [s.code ? `Code ${s.code}` : "", s.short && s.short !== s.name ? s.short : ""].filter(Boolean).join(" · ") : "";
  return `<label class="subject-pick">
    <input type="checkbox" name="subjects" value="${esc(id)}"${checked ? " checked" : ""}>
    ${s ? `<span class="subject-pick-mark">${subjectMark(s)}</span>` : ""}
    <span class="subject-pick-body"><b>${esc(name)}</b>${meta ? `<span class="small muted">${esc(meta)}</span>` : ""}</span>
    <span class="subject-pick-check" aria-hidden="true">✓</span>
  </label>`;
}

function stepSubjects(ctx) {
  const saved = currentSelection(ctx.store);
  const savedSubjects = saved
    ? (saved.subjects || [...(saved.core || []), ...(saved.optional || [])])
    : null;
  const chosen = new Set(ctx.ui._onb?.subjects ?? savedSubjects ?? CORE_SUBJECT_IDS);
  const rows = ALL_SUBJECT_IDS.map((id) => subjectRow(ctx.store, id, { checked: chosen.has(id) })).join("");
  return `<div class="onb-stage" data-stage="subjects">
    <div class="onb-step">Step 3 of ${ONBOARDING_STEPS}</div>
    <h1 class="onb-title">Which subjects <span class="onb-accent">are you studying?</span></h1>
    <p class="onb-lead">Choose any subjects you want from the eleven below. There are no compulsory or elective groups — pick at least ${SUBJECT_MIN} and change it any time in Settings.</p>
    <form data-form="onboarding-subjects" class="onb-form" novalidate>
      <div class="onb-subject-head">
        <div>
          <b>Your subjects</b>
          <p class="small muted">Tap a card to add or remove it.</p>
        </div>
        <span class="onb-count-pill"><b data-onb-count>${chosen.size}</b> / ${ALL_SUBJECT_IDS.length} selected</span>
      </div>
      <div class="subject-pick-grid onb-subject-grid">${rows}</div>
      <p class="small faint">Mathematics (Basic) replaces Mathematics (Standard) when both would appear.</p>
      <p class="field-error" data-form-error role="alert"></p>
      <div class="onb-actions">
        <button type="button" class="btn" data-act="onb-back">← Back</button>
        <button type="submit" class="btn primary onb-big">Continue <span aria-hidden="true">→</span></button>
      </div>
      <p class="xs faint">Choose at least one subject to continue.</p>
    </form>
  </div>`;
}

function stepAccount(ctx) {
  if (isSignedIn()) {
    const username = account.profile?.username ? `@${account.profile.username}` : "your account";
    return `<div class="onb-stage" data-stage="account">
      <div class="onb-step">Step 4 of ${ONBOARDING_STEPS}</div>
      <h1 class="onb-title">You're signed in, <span class="onb-accent">${esc(username)}</span>.</h1>
      <p class="onb-lead">Your username, avatar, subjects and every study record — planner tasks, ticks, sessions, notes — are saved to your account. Sign in on any device and your workspace is exactly as you left it.</p>
      <div class="onb-account-card">
        <span class="onb-account-avatar" aria-hidden="true">${esc(account.profile?.avatar || "🦉")}</span>
        <div><b>${esc(account.profile?.displayName || "Student")}</b><span class="small muted">${esc(username)} · ${esc(accountEmail())}</span></div>
      </div>
      <div class="onb-actions">
        <button type="button" class="btn" data-act="onb-back">← Back</button>
        <button type="button" class="btn primary onb-big" data-act="onb-finish">Start studying <span aria-hidden="true">→</span></button>
      </div>
      <p class="xs faint">Manage your profile and subjects any time from Settings.</p>
    </div>`;
  }
  // Signed out — the account step is a prompt, not a blocker.
  return `<div class="onb-stage" data-stage="account">
    <div class="onb-step">Step 4 of ${ONBOARDING_STEPS}</div>
    <h1 class="onb-title">Study solo, <span class="onb-accent">or sign in later.</span></h1>
    <p class="onb-lead">An account syncs your subjects, theme, preferences and all your study records across devices — planner tasks, ticks, sessions and notes included. You can sign in any time from Settings.</p>
    <div class="onb-actions">
      <button type="button" class="btn" data-act="onb-back">← Back</button>
      <button type="button" class="btn primary onb-big" data-act="onb-finish">Start studying <span aria-hidden="true">→</span></button>
    </div>
    <p class="xs faint">Sign in from Settings to sync your subjects and progress.</p>
  </div>`;
}

// The last step is only about accounts; "Finish" stays true in signed-in and
// signed-out modes alike.
const STEP_LABELS = ["Welcome", "Profile", "Subjects", "Finish"];

export function renderOnboarding(ctx) {
  const step = Math.max(0, Math.min(ONBOARDING_STEPS - 1, Number(ctx.ui.onbStep) || 0));
  ctx.ui.onbStep = step;
  const body = step === 0 ? stepWelcome(ctx.ui)
    : step === 1 ? stepProfile(ctx.ui)
    : step === 2 ? stepSubjects(ctx)
    : stepAccount(ctx);
  const rail = STEP_LABELS.map((label, i) =>
    `<span class="onb-rail-step ${i === step ? "on" : i < step ? "done" : ""}"><i>${i < step ? "✓" : i + 1}</i>${esc(label)}</span>`).join("");
  return `<div class="onb" role="dialog" aria-modal="true" aria-label="Welcome to ${esc(brand())}">
    <div class="onb-card">
      <div class="onb-rail" aria-hidden="true">${rail}</div>
      ${body}
    </div>
  </div>`;
}

/** The values gathered so far, so step changes never lose what was typed. */
export function readProfileStep(form, fallback = {}) {
  const data = {};
  for (const el of form.elements) {
    if (!el.name || el.type === "radio") continue;
    data[el.name] = typeof el.value === "string" ? el.value.trim() : el.value;
  }
  const avatar = form.querySelector('input[name="avatar"]:checked')?.value;
  if (avatar) data.avatar = avatar;
  return {
    displayName: (data.displayName || fallback.displayName || "Student").slice(0, 40),
    avatar: (data.avatar || fallback.avatar || "🦉").slice(0, 4),
    targetDate: data.targetDate || fallback.targetDate || todayISO(),
    dailyTargetMin: data.dailyTargetMin === "" || data.dailyTargetMin === undefined
      ? (fallback.dailyTargetMin ?? 230) : data.dailyTargetMin,
  };
}
