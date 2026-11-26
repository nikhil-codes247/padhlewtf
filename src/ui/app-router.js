/**
 * app-router.js — hash parsing and route gating.
 *
 * parseHash() reads the current URL hash into { name, params, query }.
 * gateTarget() decides which route a user should be sent to based on
 * authentication/account state.
 *
 * Paid students get full access everywhere. Free (non-paid) signed-in students
 * can navigate the whole app and see the nav bar, but paid-only route content
 * is shown behind a blur + lock + skeleton overlay (no real data) until they
 * upgrade.
 */
import { account } from "../core/account.js";
import { isSignedIn, hasPaidAccess, hasProfile, hasSelection } from "../core/account.js";

const PUBLIC_ROUTES = new Set(["welcome", "login", "signup", "privacy", "terms"]);
// Routes that are fully accessible to free (non-paid) students without a lock.
// Dashboard is the home base after onboarding; every feature tab stays locked.
// set-username / choose-subjects remain reachable (not forced) so a student can
// complete them from Settings whenever they want.
const FREE_ROUTES = new Set(["welcome", "dashboard", "settings", "account", "profile", "set-username", "choose-subjects", "privacy", "terms"]);

export function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean).map((p) => {
    try { return decodeURIComponent(p); } catch { return p; }
  });
  return { name: parts[0] || "dashboard", params: parts.slice(1), query: new URLSearchParams(queryPart || "") };
}

/**
 * Where should this route go?
 *
 * · configuring / restoring     → "loading"
 * · signed out                  → only the three public pages
 * · signed in                   → any route they ask for
 * · paid user on welcome        → allowed (the paid variant has no buy panel)
 * · free user on any route      → allowed (paid tabs are locked by the overlay
 *                                in renderRoute, not by a forced redirect)
 *
 * Returning the same name means "allowed, no change"; a different string
 * means "redirect to that route"; "loading" means "show the loading state".
 *
 * No one is forced through set-username or subject selection before they can
 * see the app. Those steps stay reachable from Settings / Account whenever the
 * student wants to complete them.
 */
export function gateTarget(name) {
  if (!account.ready) return "loading";
  if (account.loadError && isSignedIn()) return "loading";
  if (!isSignedIn()) return PUBLIC_ROUTES.has(name) ? name : "welcome";

  // A signed-in student never stays on the sign-in or sign-up page.
  if (name === "login" || name === "signup") {
    return hasPaidAccess() ? "welcome" : "dashboard";
  }

  // No profile → complete the profile step first. A signed-in account must
  // have a profile row, otherwise its username and paid entitlement have
  // nowhere to live.
  if (!hasProfile() && name !== "set-username") return "set-username";

  // Has a profile but no subject selection → choose subjects first.
  if (hasProfile() && !hasSelection() && name !== "choose-subjects")
    return "choose-subjects";

  // Every signed-in user can access any route. Paid-content gating is handled
  // by the lock overlay in renderRoute — not by blocking the route here.
  return name;
}

/** True when the route shows paid study content that should be locked for free users. */
export function isPaidRoute(name) {
  // Integration tests drive the app as a full-access student. The paid-tab
  // lock is covered by its own test, so they opt out through this flag.
  if (globalThis.__PADHLE_DISABLE_LOCKS__ === true) return false;
  return !PUBLIC_ROUTES.has(name) && !FREE_ROUTES.has(name);
}
