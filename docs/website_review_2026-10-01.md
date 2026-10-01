# Website review: v1.2.0 (October 1, 2026)

Reviewed the public website, all React routes, account flows, legacy content enhancements, simulation engine/store/import surfaces, production build, and application schema. Existing pages and simulation features are retained.

| # | Finding | Resolution and verification |
|---|---|---|
| 1 | Careers submitted nonexistent q1/q2/eligible database columns | Whitelisted schema-compatible payload, answers JSON and eligibility flags; payload and careers regression tests. |
| 2 | Required fields bypassed native validation; repeated requests possible | Required form validation, trimmed input, URL/email checks and pending-request guards. |
| 3 | Recovery used a fixed delay; initial session could overwrite a newer auth event | Await SDK initialization, capture recovery intent before fragment consumption, keep recovery form on failure; race and recovery tests. |
| 4 | Authentication discarded the intended account destination | Validated local return destinations propagated through gates, login and callback; redirect tests. |
| 5 | Portal inferred status from existence and hid read failures | Actual database status, loading/error/retry states across portal, careers and onboarding; portal tests. |
| 6 | Failed sign-out silently navigated away | Remain on page and display failure in navigation, profile and portal; regression test. |
| 7 | Contact form claimed a request was received although it only opened mailto | Accurate email-draft status and reusable form. |
| 8 | Imported snapshots allowed invalid nested state and unsafe HTML | Bounded structural/schema validation, trusted template reconstruction, safe inline formatting; engine and rendering tests. |
| 9 | Ambient events continued while paused; timeline broke after day one | Paused activity guard, finite clock validation and absolute-day forward seeking; engine regression tests. |
| 10 | Custom scenario picker and overlays lacked consistent keyboard behavior | Shared keyboard select, focus trap/restoration, Escape/outside-click menus, native modified-link behavior and resilient hash focus; desktop/mobile checks. |
| 11 | Metadata could duplicate; report was not prerendered; file errors were unclear | Unique Helmet description, public-route prerender, private noindex headers, safer file handling, legacy redirects and static server 404s. |
| 12 | Version labels/filtering and release verification were inconsistent | v1.2.0 labels/patch notes, multi-category filtering and reproducible desktop/mobile CI. |
| 13 | Owner RLS allowed applicants to set their own accepted/review status | Column-level application insert/update grants reserve review fields and ownership for staff; isolated PostgreSQL permission checks. Hosted migration pending. |
| 14 | Report fetched ~10.23 MB of inline image data | Extracted all 17 figures into content-hashed, lazy-loaded assets; HTML ~0.20 MB with dimensions reserved for layout stability. |

## Verification and operational limits

Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm exec playwright install --with-deps chromium`, `REQUIRE_PRERENDER=1 pnpm build`, and `pnpm test:e2e`. GitHub's Website checks workflow additionally validates schema permissions in an isolated PostgreSQL 17 database and captures desktop/mobile screenshots. The unit suite contains 92 tests. Three existing Fast Refresh lint warnings remain; there are no lint errors.

The linked Supabase project was INACTIVE during this review. Live sign-in, email delivery, application writes and hosted schema inspection could not be verified. No production user data or account settings were changed. Apply `supabase/migrations/20261001015334_protect_application_review_fields.sql` after the project's service resumes and after confirming the baseline application tables are present. The release includes and tests this migration; it does not claim the inactive hosted database has been migrated.

The Control Plane remains a deterministic demonstration; it does not operate production infrastructure. Contact submission still uses the visitor's email application, now described accurately. Performance improvement is measured asset size, not a claimed live Core Web Vitals score.
