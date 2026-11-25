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
import { isSignedIn, hasProfile, hasSelection, hasPaidAccess } from "../core/account.js";

const PUBLIC_ROUTES = new Set(["welcome", "login", "signup"]);
// Routes that are fully accessible to free (non-paid) students without a lock.
const FREE_ROUTES = new Set(["welcome", "settings", "account", "profile"]);

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
 * · signed in, no profile       → the username step
 * · signed in, no subject choice → the subject step
 * · paid user on welcome        → dashboard (skip the paywall)
 * · free user on any route      → allowed (content is locked for paid routes)
 *
 * Returning the same name means "allowed"; null means "allowed with no change".
 */
export function gateTarget(name) {
  if (!account.ready) return "loading";
  if (account.loadError && isSignedIn()) return "loading";
  if (!isSignedIn()) return PUBLIC_ROUTES.has(name) ? null : "welcome";
  if (!hasProfile()) return name === "set-username" ? null : "set-username";
  if (!hasSelection()) return name === "choose-subjects" ? null : "choose-subjects";

  const paid = hasPaidAccess();
  // Paid students skip the welcome paywall and go straight to the dashboard.
  if (paid && PUBLIC_ROUTES.has(name)) return "dashboard";
  // Everyone else (free or paid) can access any route — the lock overlay
  // handles paid-content gating for free users in app.js.
  return null;
}

/** True when the route shows paid study content that should be locked for free users. */
export function isPaidRoute(name) {
  return !PUBLIC_ROUTES.has(name) && !FREE_ROUTES.has(name);
}
