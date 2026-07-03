# Auth setup (Phase 5)

## Provider selected: Supabase Auth

**Why Supabase:** the site (`index.html`, `control-plane.html`, etc.) is
static HTML/CSS/JS with no framework, bundler, or backend (no
`package.json`, no build step -- confirmed by inspection before this
phase). Supabase Auth ships a browser ESM client
(`@supabase/supabase-js`) that works directly against a static page via
its public URL + anon key, includes real session persistence
(localStorage + refresh tokens), and its Postgres database with Row Level
Security gives us real, per-user application storage without writing any
backend server. Clerk/Auth0/Firebase were the other options in scope;
Supabase was the best fit because it is the only one of the four that
also gives us the database (application storage) in the same project,
rather than needing a second backend service.

This is real authentication: real sign up, real sign in, real sign out,
real session persistence (via Supabase's own secure client-side storage
and refresh-token rotation), and real Postgres-backed application
storage. Helicyn never touches or stores a password -- Supabase Auth
owns the credential store entirely.

## Required environment variables / config

This site has no build step, so there is nothing that reads
`process.env` or `import.meta.env` at build time. Instead:

- **Runtime config file:** `supabase-config.js` at the repo root, loaded
  by each auth-aware page as `<script type="module" src="supabase-config.js">`
  before `auth.js`. It sets two globals:
  - `window.HELICYN_SUPABASE_URL`
  - `window.HELICYN_SUPABASE_ANON_KEY`
- `supabase-config.js` is **gitignored** (see `.gitignore`) and is never
  committed. `supabase-config.example.js` (committed) is the template --
  copy it to `supabase-config.js` and fill in your project's real URL and
  anon key.
- `.env.example` at the repo root documents the same two values under
  the `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (and
  `NEXT_PUBLIC_*`) naming convention, for portability if this site is
  ever migrated to a bundler-based stack. The current static site does
  **not** read `.env` files directly.
- Both values are the Supabase **anon/public** key and project URL only.
  They are safe to expose in browser JS by design -- real data access is
  enforced by Postgres Row Level Security (RLS) policies, not by keeping
  these values secret. **Never** put the Supabase service role / secret
  key in any file that ships to the browser.

## Local setup

1. Create a Supabase project at supabase.com (or use an existing one).
2. In the Supabase SQL editor, run
   `supabase/migrations/001_founding_partner_applications.sql`.
3. In Project Settings -> API, copy the Project URL and the `anon`
   public key.
4. `cp supabase-config.example.js supabase-config.js` at the repo root,
   and fill in the two values from step 3.
5. Serve the site as static files (e.g. `python3 -m http.server 8000`
   from the repo root, or any static host) and open `/login.html`.
6. In Supabase Auth settings, enable the auth methods you want
   (email/password is on by default; magic link uses the same "Email"
   provider). For local testing, Supabase's default email confirmation
   flow uses Supabase's built-in test SMTP -- check the Auth logs in the
   Supabase dashboard if a confirmation/magic-link email doesn't arrive.

## Production setup

1. Same as local setup, but deploy `supabase-config.js` (with real
   values) alongside the static site on your host (Netlify, per the
   existing `_redirects` file). Do not commit it -- set it via your
   host's file/secret mechanism, or generate it at deploy time from a
   platform environment variable (e.g. a Netlify build plugin/script
   that writes `supabase-config.js` from `$SUPABASE_URL` /
   `$SUPABASE_ANON_KEY` before publish). No such script exists yet in
   this repo since there is currently no build step; add one if/when a
   build step is introduced.
2. **In the Supabase dashboard, under Authentication -> URL
   Configuration:**
   - Set **Site URL** to `https://helicyn.com`. This is the fallback
     Supabase uses for any auth email whose code did not specify an
     explicit redirect, so a stale dev value here (e.g.
     `http://localhost:3000`, a common framework default) sends real
     users to a dead localhost link after they click "Confirm your
     email" -- this was the root cause of the `otp_expired` /
     `access_denied` error users were landing on.
   - Add `https://helicyn.com/auth-callback.html` to **Redirect
     URLs**. `signUpWithPassword` and `signInWithMagicLink` in
     `auth.js` both now pass an explicit
     `emailRedirectTo: <origin>/auth-callback.html`, but Supabase
     rejects (silently falls back to Site URL) any redirect target
     that is not also present in this allow-list, so both the code
     change and this dashboard entry are required together.
   - If you also test against a local static server, add that
     origin's callback URL too (e.g.
     `http://localhost:8000/auth-callback.html`) so local sign-ups
     redirect correctly during development; it does not need to
     replace the production entry.
3. `/auth-callback.html` (+ `auth-callback.js`) is the single landing
   page for both signup-confirmation and magic-link emails. It
   establishes the session and redirects into `/partner-portal.html`
   on success, and renders a real "link expired or already used, want
   a new one?" UI (with a resend action) instead of exposing
   Supabase's raw `#error=...` hash. `otp_expired` in particular can
   also happen even with correct URL config, since the verification
   token is single-use and some corporate/email-client link scanners
   pre-fetch links before a real user clicks them; the resend flow on
   that page is the recovery path.
4. Confirm RLS is enabled on `founding_partner_applications` (the
   migration does this) before going live -- without RLS, the anon key
   would allow any authenticated user to read/write any row.

## Database schema

`supabase/migrations/001_founding_partner_applications.sql` creates the
`founding_partner_applications` table (see
`docs/founding_partner_program.md` for the field list and
`docs/website_research_integration.md` for how the app links to auth
users). Run it once against a real Supabase project via the SQL editor
or `supabase db push` if you use the Supabase CLI.

## RLS / security policies

Row Level Security is enabled on `founding_partner_applications`. Three
policies, all scoped to the `authenticated` role and `auth.uid() =
user_id`:

- **Insert:** an authenticated user may insert a row only with their own
  `user_id`.
- **Select:** an authenticated user may read only their own row(s).
- **Update:** an authenticated user may update only their own row(s).

There is intentionally **no** anonymous (pre-login) insert/select policy
and **no** admin-read policy in this phase -- the onboarding flow
requires sign-in first (see `docs/founding_partner_program.md` for why),
and admin review tooling is out of scope for Phase 5.

## How to test

All of the following require a real Supabase project (steps above) --
there is no fake/offline auth mode. If `supabase-config.js` is missing or
still has placeholder values, every auth page shows a clear "Setup
required" banner and disables its form instead of pretending to work.

- **Sign up + email verification (full new-user path):** go to
  `/login.html`, "Sign up" tab, enter a real email + password, submit.
  Supabase sends a confirmation email; click it and confirm you land
  on `/auth-callback.html`, see "Verified", and are redirected into
  `/partner-portal.html` signed in, with no `#error=...` or raw hash
  ever visible in the address bar. To test the failure path, wait for
  a link to expire (or click a link twice) and confirm
  `/auth-callback.html` shows the "link expired or already used" panel
  with a working resend action, rather than the raw Supabase error.
- **Sign in:** confirm the account, then use the "Sign in" tab
  (password) or "Magic link" method on `/login.html`.
- **Sign out:** from `/login.html` (once signed in) or the "Sign out"
  button in `/partner-portal.html`'s Account card.
- **Partner portal protection:** open `/partner-portal.html` in a
  logged-out browser/session -- it must show "Sign-in required" and a
  link to `/login.html`, not any account or application data.
- **Onboarding submission:** sign in, go to `/onboarding.html`, fill in
  the required fields (company name, name, email, consent checkbox),
  submit, and confirm the success state ("Thanks. Your founding partner
  application has been submitted...") appears only after the Supabase
  insert actually succeeds. Then reload `/partner-portal.html` and
  confirm the submitted application (company name, submitted date,
  interests) appears under "Application status".

## What not to commit

- `supabase-config.js` (gitignored -- real project URL + anon key)
- any `.env` / `.env.local` file (gitignored)
- the Supabase **service role** / secret key, anywhere, ever
- raw exports of `founding_partner_applications` data
