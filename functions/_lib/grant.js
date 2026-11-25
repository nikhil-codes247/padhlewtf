/**
 * Shared entitlement grant for the payment endpoints.
 *
 * The browser never writes the plan directly. The server either:
 *   · updates the caller's profile with their own JWT (RLS-scoped), or
 *   · uses a service-role key when one is configured (PADHLE_SUPABASE_SERVICE_KEY).
 *
 * If the profile row does not exist yet — a student can pay before finishing the
 * profile step — the row is created and the grant is retried. A verified payment
 * must never be lost because a row was missing.
 */

export const PLAN = "full_access";
// Full access until end of day, 10 March 2027 (Indian Standard Time, UTC+5:30).
export const EXPIRES_AT = "2027-03-10T23:59:59+05:30";

const snippet = (text, n = 200) => String(text || "").slice(0, n);

function generatedUsername(uid, attempt = 0) {
  const clean = String(uid || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "student";
  const suffix = Math.random().toString(36).slice(2, 6);
  return `student_${clean.slice(0, 8)}${attempt ? `_${suffix}` : ""}`.slice(0, 20);
}

function displayName(email) {
  const local = String(email || "").split("@")[0].replace(/[._-]+/g, " ").trim();
  return (local || "Student").slice(0, 40);
}

/**
 * Grant full access to `uid`.
 *
 * @returns {Promise<{paid: boolean, status?: number, authRequired?: boolean, error?: string}>}
 */
export async function grantPaidAccess({ env, token, uid, email }) {
  const base = String(env.PADHLE_SUPABASE_URL || "").replace(/\/$/, "");
  const anonKey = env.PADHLE_SUPABASE_ANON_KEY;
  const serviceKey = env.PADHLE_SUPABASE_SERVICE_KEY;

  if (!base || !anonKey) {
    return { paid: false, error: "The deployment is not connected to Supabase, so access could not be activated." };
  }
  if (!uid) {
    return { paid: false, status: 401, authRequired: true, error: "That sign-in token is not readable. Sign in again and press Retry activation." };
  }
  if (!serviceKey && !token) {
    return { paid: false, status: 401, authRequired: true, error: "You were signed out when the payment finished. Sign in again and it will activate automatically." };
  }

  // A service-role key can write the row even if RLS or an expired JWT would
  // otherwise block it. Without one, the student's own JWT keeps the write
  // scoped to their row.
  const key = serviceKey || anonKey;
  const authorization = `Bearer ${serviceKey || token}`;
  const headers = {
    apikey: key,
    Authorization: authorization,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
  const table = `${base}/rest/v1/profiles`;
  const patch = () =>
    fetch(`${table}?id=eq.${encodeURIComponent(uid)}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ plan: PLAN, plan_expires_at: EXPIRES_AT }),
    });

  const updated = await patch();
  if (!updated.ok) {
    const detail = await updated.text().catch(() => "");
    return {
      paid: false,
      status: updated.status,
      authRequired: updated.status === 401,
      error: `Could not activate access (HTTP ${updated.status})${detail ? `: ${snippet(detail)}` : ""}.`,
    };
  }

  let rows = await updated.json().catch(() => null);
  if (Array.isArray(rows) && rows.length > 0) return { paid: true };
  // PostgREST can answer 204/empty even on success; only an explicit empty
  // array means "RLS matched no row".
  if (!Array.isArray(rows)) return { paid: true };

  // No profile row for this account. Create one, then retry the update.
  let insertError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const insert = await fetch(table, {
      method: "POST",
      headers,
      body: JSON.stringify({
        id: uid,
        username: generatedUsername(uid, attempt),
        display_name: displayName(email),
        plan: PLAN,
        plan_expires_at: EXPIRES_AT,
      }),
    });
    if (insert.ok) return { paid: true };
    insertError = await insert.text().catch(() => "");

    // The row may have appeared between the PATCH and the INSERT, or the
    // generated username may already be taken. Retry the update first.
    const retried = await patch();
    if (retried.ok) {
      rows = await retried.json().catch(() => null);
      if (!Array.isArray(rows) || rows.length > 0) return { paid: true };
    }
    if (!/duplicate key|23505/i.test(insertError)) break;
  }

  return {
    paid: false,
    status: 409,
    error: `No profile row was found for this account and one could not be created${insertError ? `: ${snippet(insertError)}` : ""}.`,
  };
}
