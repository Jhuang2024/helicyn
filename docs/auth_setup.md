# Authentication and application setup

The website is a React/TypeScript Vite application. Install with pnpm 10.34.6, run `pnpm dev`, and deploy the compiled `dist/` from `pnpm build`. Production builds require Playwright Chromium for public-page prerendering.

Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` before building (see `.env.example` and `src/services/supabase.ts`). These are public client values; never put a service-role key in Vite variables or frontend code. The deployed public project defaults are also defined in that service. A project must be active for account operations to work.

In Supabase Auth configure the production site URL and allow `https://helicyn.com/auth-callback` (including query variants), plus the matching localhost callback for development. Recovery uses an explicit `type=recovery` callback query, and validated `next` destinations preserve the user's account page. Keep email confirmation and recovery templates compatible with the configured redirect URL. Callback processing waits for the SDK session; it does not use a timing delay.

Apply the repository's migrations in order to a project with the standard Supabase `auth.users`, `auth.uid()`, `anon`, and `authenticated` roles. The application tables are defined in `001_founding_partner_applications.sql` and `003_job_applications.sql`; the October 2026 migration protects review fields with column grants. Do not skip that migration: owner RLS alone does not prevent applicants from changing their own review status. Use the CLI migration history tools before pushing when older numbered scripts were previously applied manually.

Applications require sign-in and use owner RLS. Job answers are stored in the `answers` JSON object; eligibility is represented by `is_berkeley_student` and `is_sf_based`. Applicant requests can insert and edit application inputs but cannot set review decisions, identifiers, ownership or timestamps. Administrative reviews require a trusted server/service-role workflow; no service-role credentials belong in the browser.

`Website checks` tests column privileges and owner isolation against disposable PostgreSQL. Live email deliverability, redirect configuration and real account flows must also be verified on an active hosted project; automated account regression tests mock the account service and send no emails.
