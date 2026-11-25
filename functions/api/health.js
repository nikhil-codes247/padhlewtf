/**
 * Cloudflare Pages Function: GET/POST /api/health
 *
 * Deployment self-check for payments. It never returns a secret — only
 * booleans, HTTP statuses and short response snippets — so it is safe to leave
 * in production and useful when a payment "succeeds" but access does not stick.
 *
 * When the caller sends a Supabase access token, the check also reports the
 * signed-in student's profile row (whether it exists, and its plan). That is
 * the one piece of state the payment grant depends on.
 */

const snippet = (text, n = 200) => String(text || "").slice(0, n);

function jwtSubject(token) {
  try {
    const part = String(token).split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)));
    return typeof parsed.sub === "string" && parsed.sub ? parsed.sub : null;
  } catch {
    return null;
  }
}

async function check(env, request) {
  const url = String(env.PADHLE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = env.PADHLE_SUPABASE_ANON_KEY;
  const out = {
    env: {
      razorpayKeyId: Boolean(env.RAZORPAY_KEY_ID),
      razorpayKeySecret: Boolean(env.RAZORPAY_KEY_SECRET),
      supabaseUrl: Boolean(url),
      supabaseAnonKey: Boolean(anon),
      supabaseServiceKey: Boolean(env.PADHLE_SUPABASE_SERVICE_KEY),
    },
  };

  if (url && anon) {
    try {
      const res = await fetch(`${url}/rest/v1/subjects?select=id&limit=1`, {
        headers: { apikey: anon, Authorization: `Bearer ${anon}` },
      });
      out.supabaseAnonRead = { status: res.status, body: snippet(await res.text()) };
    } catch (err) {
      out.supabaseAnonRead = { error: String(err?.message || err) };
    }
  }

  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token && url && anon) {
    const sub = jwtSubject(token);
    out.token = { readable: Boolean(sub), sub };
    if (sub) {
      try {
        const res = await fetch(
          `${url}/rest/v1/profiles?select=id,username,plan,plan_expires_at&id=eq.${encodeURIComponent(sub)}`,
          { headers: { apikey: anon, Authorization: `Bearer ${token}` } },
        );
        out.profile = { status: res.status, body: snippet(await res.text(), 400) };
      } catch (err) {
        out.profile = { error: String(err?.message || err) };
      }
      try {
        const res = await fetch(`${url}/auth/v1/user`, {
          headers: { apikey: anon, Authorization: `Bearer ${token}` },
        });
        out.auth = { status: res.status, body: snippet(await res.text(), 200) };
      } catch (err) {
        out.auth = { error: String(err?.message || err) };
      }
    }
  }

  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    try {
      const basic = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const res = await fetch("https://api.razorpay.com/v1/payments?count=1", {
        headers: { Authorization: `Basic ${basic}` },
      });
      out.razorpay = { status: res.status };
    } catch (err) {
      out.razorpay = { error: String(err?.message || err) };
    }
  }

  return out;
}

export const onRequestGet = async ({ request, env }) => Response.json(await check(env, request));
export const onRequestPost = async ({ request, env }) => Response.json(await check(env, request));
