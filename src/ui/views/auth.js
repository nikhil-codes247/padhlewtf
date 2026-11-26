/**
 * auth.js — sign-up and log-in screens for Supabase deployments.
 *
 * One view serves both modes (`#/login` and `#/signup`) so the two can never
 * drift apart. Validation and error copy live here; the actual calls are in
 * `core/account.js`, and the form submit is wired once in `ui/actions.js`.
 *
 * When email confirmation is enabled in Supabase, sign-up returns no session.
 * Rather than dumping the visitor back on the landing page, the view switches
 * to a "check your inbox" state and remembers the address for this tab.
 */
import { debounce, esc } from "../dom.js";
import { brand, TAGLINE } from "../../core/branding.js";
import { account, checkUsernameAvailability, pendingSignup } from "../../core/account.js";

const BENEFITS = [
  "Your subjects, saved to your account",
  "All eleven subjects — pick your own mix",
  "Pick up on any device, with the same preferences",
  "Private by default — no ads, no noise",
];

function pendingCard(ctx) {
  const email = account.pendingEmail;
  return `<div class="auth-wrap">
    <section class="card auth-card">
      <div class="auth-ico" aria-hidden="true">✉</div>
      <span class="eyebrow">One more step</span>
      <h1>Check your inbox.</h1>
      <p class="muted">We sent a confirmation link to <b>${esc(email)}</b>. Open it, then come back and log in to finish setting up your account.</p>
      <div class="auth-actions">
        <button class="btn primary wide" type="button" data-act="clear-pending-email" data-next="#/login">I've confirmed — log in</button>
        <button class="btn ghost wide" type="button" data-act="clear-pending-email">Use a different email</button>
      </div>
      <p class="small faint">The link can take a minute to arrive. Check spam if it does not.</p>
    </section>
    <aside class="auth-side" aria-label="Why create an account">
      <div class="auth-side-card">
        <span class="eyebrow">While you wait</span>
        <h2>What an account adds</h2>
        <ul class="auth-benefits">${BENEFITS.map((b) => `<li>✓ <span>${esc(b)}</span></li>`).join("")}</ul>
        <p class="small muted">Your workspace opens the moment you confirm your email.</p>
      </div>
    </aside>
  </div>`;
}

function unavailableCard() {
  return `<div class="auth-wrap">
    <section class="card auth-card">
      <div class="auth-ico" aria-hidden="true">⚑</div>
      <span class="eyebrow">Connection problem</span>
      <h1>We could not reach the server.</h1>
      <p class="muted">Your study workspace lives on our servers, and we could not reach them just now. Check your connection and try again — nothing you have done so far is lost.</p>
      <button class="btn primary wide" type="button" data-act="account-retry">Try again</button>
    </section>
  </div>`;
}

export default {
  id: "auth",
  title: "Account",
  render(ctx) {
    const mode = ctx.route.name === "signup" ? "signup" : ctx.ui.authMode === "forgot" ? "forgot" : "login";
    if (account.loadError) return unavailableCard();
    if (account.pendingEmail) return pendingCard(ctx);

    const isSignup = mode === "signup";
    const isForgot = mode === "forgot";
    const title = isSignup ? "Create your account." : isForgot ? "Reset your password." : "Welcome back.";
    const lead = isSignup
      ? "One account keeps your username, subjects, preferences and every study record in sync across your devices."
      : isForgot
        ? "Enter your email and we'll send a link to reset your password."
        : "Log in to open your subjects and your personalised dashboard.";
    const submit = isSignup ? "Create account" : isForgot ? "Send reset link" : "Log in";
    const swap = isSignup
      ? `Already have an account? <a href="#/login">Log in</a>`
      : isForgot
        ? `Remember your password? <a href="#" data-act="auth-cancel-forgot">Log in</a>`
        : `New to ${esc(brand())}? <a href="#/signup">Create an account</a>`;
    const suggestedUsername = isSignup ? (pendingSignup()?.username || "") : "";

    return `<div class="auth-wrap">
      <section class="card auth-card">
        <div class="auth-head">
          <span class="auth-ico" aria-hidden="true">${isSignup ? "✦" : "→"}</span>
          <div>
            <span class="eyebrow">${isSignup ? "Join " + esc(brand()) : esc(brand()) + " · " + esc(TAGLINE)}</span>
            <h1>${title}</h1>
            <p class="muted">${esc(lead)}</p>
          </div>
        </div>

        <form class="auth-form" data-form="${isSignup ? "padhle-signup" : isForgot ? "padhle-forgot" : "padhle-login"}" novalidate>
          <div class="field">
            <label for="auth-email">Email</label>
            <input class="input" id="auth-email" name="email" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" required>
          </div>
          ${!isForgot && isSignup ? `<div class="field">
            <label for="auth-username">Username</label>
            <input class="input" id="auth-username" name="username" type="text" value="${esc(suggestedUsername)}" placeholder="e.g. aarav_studies" autocomplete="username" spellcheck="false" maxlength="20" required data-signup-username>
            <span class="small" data-username-status role="status" aria-live="polite"></span>
            <span class="small faint">3–20 characters. Letters, numbers and underscores only. It must be unique.</span>
          </div>` : ""}
          ${!isForgot ? `<div class="field">
            <label for="auth-password">Password</label>
            <input class="input" id="auth-password" name="password" type="password" autocomplete="${isSignup ? "new-password" : "current-password"}" placeholder="${isSignup ? "At least 8 characters" : "Your password"}" minlength="8" required>
            ${isSignup ? `<span class="small faint">Use at least 8 characters. A phrase you remember is stronger than a short password.</span>` : ""}
          </div>
          ${isSignup ? `<div class="field">
            <label for="auth-confirm">Confirm password</label>
            <input class="input" id="auth-confirm" name="confirm" type="password" autocomplete="new-password" placeholder="Type it again" minlength="8" required>
          </div>` : ""}` : ""}
          <p class="field-error" data-form-error role="alert"></p>
          ${!isForgot ? `<div class="row gap-2 mt-3">
            <span class="small faint">Or continue with</span>
            <button class="btn wide" type="button" data-act="auth-google">Continue with Google</button>
          </div>` : ""}
          <button class="btn primary wide" type="submit">${submit}</button>
        </form>

        <p class="small muted auth-swap">${swap}</p>
        ${!isSignup && !isForgot ? `<button class="link-btn small" type="button" data-act="auth-forgot">Forgot your password?</button>` : ""}
        <p class="small faint auth-back"><a href="#/welcome">← Back to the home page</a></p>
      </section>

      <aside class="auth-side" aria-label="Why create an account">
        <div class="auth-side-card">
          <span class="eyebrow">${isSignup ? "What you get" : "Your study space"}</span>
          <h2>${isSignup ? "A calmer way through the syllabus." : "Pick up where you left off."}</h2>
          <ul class="auth-benefits">${BENEFITS.map((b) => `<li>✓ <span>${esc(b)}</span></li>`).join("")}</ul>
          <div class="auth-quote">
            <span class="eyebrow">The daily plan</span>
            <p>A huge syllabus, reduced to the next small step — and a record of what you finished.</p>
          </div>
        </div>
      </aside>
    </div>`;
  },

  mount(ctx) {
    if (ctx.route.name !== "signup") return null;
    const input = document.getElementById("auth-username");
    const status = document.querySelector("[data-username-status]");
    if (!input || !status) return null;
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
    const onInput = () => run();
    input.addEventListener("input", onInput);
    if (input.value) run();
    return () => input.removeEventListener("input", onInput);
  },
};
