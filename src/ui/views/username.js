/**
 * username.js — profile creation (and profile editing) for signed-in students.
 *
 * A username is required before subject selection. It is checked live for
 * availability, but the database's unique index is the authority: a second
 * simultaneous claim is rejected there, not here. The same screen doubles as
 * "edit profile" from the account page.
 */
import { esc, debounce } from "../dom.js?v=mwz8hppl";
import { AVATARS } from "../onboarding.js?v=mwz8hppl";
import { account, accountEmail, accountUsername, checkUsernameAvailability, pendingSignup } from "../../core/account.js?v=mwz8hppl";

function avatarChoices(selected) {
  return AVATARS.map((a) => `<label class="onb-avatar ${a === selected ? "on" : ""}">
    <input type="radio" name="avatar" value="${esc(a)}"${a === selected ? " checked" : ""} aria-label="Avatar ${esc(a)}">
    <span aria-hidden="true">${esc(a)}</span>
  </label>`).join("");
}

export default {
  id: "username",
  title: "Your profile",
  render(ctx) {
    const editing = Boolean(account.profile);
    const email = accountEmail();
    const current = account.profile;
    const fallbackName = (account.session?.user?.email || "").split("@")[0] || "Student";
    // Keep whatever the student has typed if an account/store update re-renders
    // this screen mid-form (e.g. the sign-up flow finishing in the background).
    const draft = ctx.ui.profileDraft || null;
    const pending = pendingSignup();
    const displayName = draft ? draft.displayName : (current?.displayName || ctx.store.state.settings?.displayName || fallbackName);
    const avatar = draft ? draft.avatar : (current?.avatar || ctx.store.state.settings?.avatar || "🦉");
    const username = draft ? draft.username : (current?.username || pending?.username || "");

    return `<div class="setup-wrap">
      <section class="card setup-card">
        <div class="setup-head">
          <span class="eyebrow">${editing ? "Edit profile" : "Step 1 of 2 · Your profile"}</span>
          <h1>${editing ? "Your profile." : "Pick your username."}</h1>
          <p class="muted">${editing
            ? "Your username is how you appear on shared progress cards. Changing it keeps everything else intact."
            : "This is how you appear in the app. It has to be unique, so no two students can share one."}</p>
        </div>

        <div class="setup-account">
          <span class="dot" style="background:var(--ok)"></span>
          <span class="small muted">Signed in as <b>${esc(email)}</b></span>
          <button class="link-btn small" type="button" data-act="auth-signout">Sign out</button>
        </div>

        <form class="setup-form" data-form="padhle-profile" novalidate>
          <div class="field">
            <label for="profile-username">Username</label>
            <input class="input" id="profile-username" name="username" type="text" value="${esc(username)}" placeholder="e.g. aarav_studies" autocomplete="username" spellcheck="false" maxlength="20" required data-username-check>
            <span class="small" data-username-status role="status" aria-live="polite"></span>
            <span class="small faint">3–20 characters. Letters, numbers and underscores only.</span>
          </div>

          <div class="field">
            <label for="profile-name">Display name</label>
            <input class="input" id="profile-name" name="displayName" type="text" value="${esc(displayName)}" placeholder="Your name" autocomplete="name" maxlength="40">
            <span class="small faint">Optional. Your username is always shown next to it.</span>
          </div>

          <fieldset class="field setup-avatars">
            <legend>Avatar</legend>
            <div class="onb-avatars">${avatarChoices(avatar)}</div>
          </fieldset>

          <p class="field-error" data-form-error role="alert"></p>
          <div class="setup-actions">
            <button class="btn primary" type="submit">${editing ? "Save changes" : "Continue to subjects"} <span aria-hidden="true">→</span></button>
            ${editing ? `<a class="btn ghost" href="#/account">Cancel</a>` : ""}
          </div>
        </form>
      </section>

      <aside class="setup-side" aria-label="Setup progress">
        <div class="setup-progress">
          <div class="setup-progress-head">
            <span class="eyebrow">Setting up</span>
            <span class="small muted">${editing ? "Profile" : "1 of 2"}</span>
          </div>
          <ol class="setup-steps">
            <li class="on"><span class="setup-step-dot">1</span><div><b>Your profile</b><span class="small muted">Username and avatar</span></div></li>
            <li class="${editing ? "on" : ""}"><span class="setup-step-dot">2</span><div><b>Your subjects</b><span class="small muted">Any of the eleven you like</span></div></li>
          </ol>
          <p class="small muted">You can change all of this later from Settings.</p>
        </div>
        ${accountUsername() ? `<div class="setup-note"><span class="eyebrow">Current username</span><b>@${esc(accountUsername())}</b></div>` : ""}
      </aside>
    </div>`;
  },

  mount(ctx) {
    const input = document.getElementById("profile-username");
    const status = document.querySelector("[data-username-status]");
    if (!input || !status) return;
    const form = input.closest("form");
    const nameInput = form.querySelector('[name="displayName"]');
    const remember = () => {
      ctx.ui.profileDraft = {
        username: input.value,
        displayName: nameInput?.value || "",
        avatar: form.querySelector('input[name="avatar"]:checked')?.value || "",
      };
    };
    let seq = 0;
    const run = debounce(async () => {
      const value = input.value.trim();
      const mySeq = ++seq;
      status.className = "small muted";
      if (!value) { status.textContent = ""; return; }
      status.textContent = "Checking availability…";
      const res = await checkUsernameAvailability(value);
      if (mySeq !== seq) return;
      if (!res.ok) {
        status.textContent = res.error;
        status.className = "small bad-text";
      } else if (res.available === true) {
        status.textContent = "✓ Available";
        status.className = "small ok-text";
      } else if (res.available === false) {
        status.textContent = "That username is already taken.";
        status.className = "small bad-text";
      } else {
        status.textContent = res.warning || "";
        status.className = "small muted";
      }
    }, 350);
    const onInput = () => { remember(); run(); };
    const onChange = () => remember();
    input.addEventListener("input", onInput);
    nameInput?.addEventListener("input", onChange);
    form.addEventListener("change", onChange);
    if (input.value) run();
    return () => {
      input.removeEventListener("input", onInput);
      nameInput?.removeEventListener("input", onChange);
      form.removeEventListener("change", onChange);
    };
  },
};
