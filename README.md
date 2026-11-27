# PADHLE.WTF — Cloudflare Pages Deployment

This folder contains the complete, deployable SaaS: the static website plus the Razorpay payment backend (Cloudflare Pages Functions).

## What's inside
- `config.js`, `index.html`, `src/`, `fonts/`, `404.html` — the built website (synced from `build-src/dist/`)
- `functions/api/create-order.js` — Creates the ₹199 Razorpay order (Cloudflare Function)
- `functions/api/verify-payment.js` — Verifies payment signature & activates access (Cloudflare Function)
- `functions/api/claim-payment.js` — Recovers captured ₹199 payment by email match (Cloudflare Function)
- `functions/api/health.js` — Public health check (env status, Supabase, Razorpay)
- `functions/_lib/grant.js` — Shared profile grant helper (update/insert/create row)
- `wrangler.toml` — Cloudflare Pages configuration
- `package.json` — Project metadata
- `.env.example` — Template of variables to add in Cloudflare dashboard

---

## Step-by-step: Deploy to Cloudflare Pages

### Prerequisites
You're already logged into Cloudflare in your browser.

### 1. Push this folder to GitHub

Cloudflare Pages deploys from a Git repository. Plain drag-and-drop uploads will show the website, but the Razorpay payment buttons will NOT work (there's no server to run the Functions).

1. Create a new repository on GitHub (e.g., `padhle`)
2. Copy **everything inside** this `cloudflare/` folder into that repository
3. Commit and push

### 2. Connect Cloudflare Pages to your repo

1. Log in to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Go to **Workers & Pages** → **Create application** → **Pages**
3. Select **Connect to Git**
4. Choose **GitHub** and authorize Cloudflare
5. Select your repository (e.g., `nikhil-codes247/padhle`)
6. Click **Begin setup**

### 3. Configure build settings

Cloudflare Pages will auto-detect the settings. Verify these:

| Setting | Value |
|---|---|
| **Project name** | `padhle-wtf` (or your choice) |
| **Production branch** | `main` |
| **Build command** | `npm install` |
| **Functions directory** | `functions` |
| **Publish directory** | (leave blank — static files are at root) |

Click **Save and Deploy**.

### 4. Add environment variables (required for payments)

1. In Cloudflare Dashboard, go to your Pages project → **Settings** → **Environment variables**
2. Click **Add variable** for each of the following:

| Variable | Value | Environment |
|---|---|---|
| `RAZORPAY_KEY_ID` | `rzp_test_U4KNjocoNfom30` | Production |
| `RAZORPAY_KEY_SECRET` | `ftec13jYlvbMJC0fxFc5GsxD` | Production |
| `PADHLE_SUPABASE_URL` | `https://<your-project-ref>.supabase.co` | Production |
| `PADHLE_SUPABASE_ANON_KEY` | `sb_publishable_<your-anon-key>` | Production |
| `PADHLE_SITE_URL` | `https://<your-site>.pages.dev` | Production |
| `PADHLE_ENV` | `production` | Production |

3. Click **Save**
4. **Redeploy** the project so Cloudflare picks up the variables

### 5. Apply the Supabase migration (required for paid access)

Run this **once** in your Supabase project's **SQL Editor**:

```sql
-- Add plan + expiry columns to profiles
alter table if exists public.profiles
  add column if not exists plan text not null default 'free';

alter table if exists public.profiles
  add column if not exists plan_expires_at timestamptz;

comment on column public.profiles.plan is
  'Entitlement plan. "free" (default) or "full_access" after a successful one-time purchase.';

comment on column public.profiles.plan_expires_at is
  'When full_access expires. Set to end of day 10 March 2027 (IST) on purchase.';

-- Helper function to check if signed-in student has active paid access
create or replace function public.has_paid_access()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and plan = 'full_access'
      and plan_expires_at is not null
      and plan_expires_at > now()
  );
$$;

grant execute on function public.has_paid_access() to authenticated;
```

### 6. Test it

1. Open your Cloudflare Pages site URL
2. Sign up / sign in and complete the onboarding tour
3. Go to **Account**
4. You'll see **"Buy full access — ₹199"** (only shown after onboarding finishes)
5. Click it, complete the Razorpay test payment
6. The panel flips to **"Full access until 10 March 2027"**

These are Razorpay **test** keys, so no real money moves. Use a test card (e.g. `4111 1111 1111 1111`, any future expiry, any CVV, OTP `123456`) in the modal.

---

## UX Features

### Lazy loading (Syllabus Map & PYQ Insights)
- **Syllabus Map** (`#/curriculum`): First paint loads only the subject list. Chapters and topics download per-subject when the user taps a subject card. Saves egress for students who only check a few subjects.
- **PYQ Insights** (`#/pyq`): First paint loads only library metadata (paper counts, years, subject list). Per-subject papers and topic stats download when the user taps a subject card.

### Glassmorphism lock overlay
Free (non-paid) users see the full nav bar and interface. Paid tabs show a **light frosted-glass overlay** covering only the tab content area (not the navbar, header, or footer):
- `backdrop-filter: blur(40px) saturate(1.2)` on the full content backdrop
- Translucent glass card with pencil-border and hand-drawn SVG lock icon; a solid fallback when `backdrop-filter` is unsupported
- "Upgrade to access" title, ₹199 note, buy button, and hint

### Pay after onboarding
New accounts complete the full onboarding tour (Welcome → Profile → Subjects → Finish) before any payment prompt appears. The buy panel and locked previews are hidden until `onboarded` is true. Paid users who log in see the welcome page without any buy option — just a "Full access active until 10 March 2027" badge and unlocked feature cards.

## What free users see vs paid users

| User state | Landing page | Dashboard access | Pricing on welcome |
|---|---|---|---|
| Signed out | Marketing welcome | Blocked → welcome | Not shown |
| Signed in, **free** | Welcome + locked feature previews | Full navbar, paid tabs glassmorphism-locked | ✅ "Buy full access — ₹199" (after onboarding) |
| Signed in, **paid** | Welcome (no buy panel, active-plan badge) | Full access everywhere | ❌ Hidden |

### Free user experience
Free users see the whole nav bar and interface. When they click a paid tab (dashboard, planner, revision, flashcards, practice questions, etc.):
- The tab content is covered by a **glassmorphism lock overlay** (blur + frosted glass card)
- A **hand-drawn SVG lock icon** appears in the center
- An **"Upgrade to access"** button opens Razorpay checkout
- The lock covers only the tab content — navbar, header, and footer stay visible

---

## To go live with real money

Do these in order. The first two are required before the entitlement write can
be locked down; until they are done, a signed-in student could still try to
PATCH their own `plan` column directly.

1. **Add the Supabase service-role key** to Cloudflare Pages environment
   variables as `PADHLE_SUPABASE_SERVICE_KEY` (Project Settings → API →
   `service_role`). This is server-side only — never put it in `config.js`.
2. **Apply `build-src/supabase/migrations/0011_lock_entitlement.sql`** in the
   Supabase SQL editor. It revokes write access to `plan` / `plan_expires_at`
   from the `authenticated` role and adds a trigger that only the service role
   (or a database admin) can bypass.
3. Redeploy, then confirm `https://padhle.wtf/api/health` reports
   `"supabaseServiceKey": true`.
4. Run one test purchase end-to-end; the profile should flip to
   `plan = full_access` and a second browser should see the unlocked UI.
5. Replace `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` with your **live**
   Razorpay keys in Cloudflare environment variables, then redeploy.
6. Replace the test `razorpayKeyId` in the build config with the live public
   key id (the secret stays server-side).

### Supabase Auth URL configuration (required for Google sign-in)

In Supabase → Authentication → URL Configuration:

| Setting | Value |
|---|---|
| Site URL | `https://padhle.wtf/` |
| Redirect URLs | `https://padhle.wtf/` |
| | `https://padhlewtf.pages.dev/` |
| | `http://localhost:4173/` |

The app sends `redirect_to=https://padhle.wtf/` (no `#/route`) so Supabase's
own `#access_token=…` fragment is not appended behind a second hash. If a
redirect is not on this allowlist, Supabase silently falls back to the Site URL,
which makes sign-in look broken. In Google Cloud → Credentials → OAuth client,
the only Authorized redirect URI is Supabase's callback:
`https://joyzfnsppohprpfuhsyd.supabase.co/auth/v1/callback` — never the app
domain.

While the Google consent screen is in **Testing** publishing status, only
accounts listed under Test users can sign in. Add the addresses you will use,
or publish the app.

### Google OAuth verification

Submit the clean, crawlable URLs (not hash routes):

| Field | URL |
|---|---|
| App home page | `https://padhle.wtf/` |
| Privacy policy | `https://padhle.wtf/privacy` |
| Terms of service | `https://padhle.wtf/terms` |
| Authorized domain | `padhle.wtf` |

`/#/dashboard` and `/#/privacy` are client-side hash routes, which Google's
reviewer cannot fetch as separate pages. The static `/privacy` and `/terms`
pages contain the same policy in plain HTML, plus the Google Sign-In / Limited
Use disclosure. Verify ownership of `padhle.wtf` in Google Search Console
(DNS TXT or an HTML verification file at the site root) before resubmitting.

---

## Important security notes

- `RAZORPAY_KEY_SECRET` never reaches the browser. It lives only in Cloudflare environment variables and is used inside the Pages Functions.
- `PADHLE_SUPABASE_SERVICE_KEY` is server-side only and is used solely by the payment functions to write the entitlement.
- The built `config.js` contains only the public `RAZORPAY_KEY_ID`.
- The student's own JWT is never trusted to grant paid access once migration
  `0011_lock_entitlement.sql` is applied.
- `.env` is a template only — never commit real secrets.
