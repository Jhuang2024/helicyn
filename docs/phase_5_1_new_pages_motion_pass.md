# Phase 5.1: premium motion pass for the new Phase 5 pages

Scope: visual/motion polish only, applied to the five pages Phase 5 added
(`partners.html`, `onboarding.html`, `login.html`, `partner-portal.html`,
`research.html`). No auth, database, onboarding-submission, simulator, or
control-plane/homepage logic changed.

## Pages polished

- `/partners`: cinematic hero, animated Stage 1/2/3 timeline, benefit
  cards, illustrative pricing-example strip, premium final CTA.
- `/onboarding`: 5-step progress stepper, sectioned form, validation
  shake/animation, trust panel, animated success/notice states.
- `/login`: centered animated auth card, orb backdrop, focus states,
  button loading pulse, animated error/success notices.
- `/partner-portal`: staggered account/status/stage/link cards with
  hover spotlight+tilt, animated status pill, correct hidden/shown states.
- `/research`: premium hero, animated 5-stage research pipeline
  (Public traces -> ML models -> simulator -> policies -> evidence
  package), findings placeholder cards, limitations block.

Homepage, `/control-plane`, `styles.css`, `helicyn-ml`, `helicyn-sim`, and
the Supabase migration/config were **not** touched.

## Motion system added (all opt-in, scoped to `partner.css`)

- `.orbfield` / `.orb`: decorative ambient glow behind hero sections
  (pure CSS drift, frozen under reduced motion).
- Card spotlight + tilt on `.rolecard`, `.stagecard`, `.portalcard`,
  and `.benefitcard`, reusing the *existing* homepage/control-plane
  cursor-tracked spotlight system (`ambient.js`'s `--cx/--cy` and
  `--tiltx/--tilty` custom properties); `ambient.js`'s `CARD_SEL`/
  `TILT_SEL` selector lists were extended with these four classes
  (2-line diff, no new JS logic). Fine-pointer only; no-op on touch or
  reduced motion.
- `.benefitgrid` / `.benefitcard`: new founding-partner benefit cards
  (previously a plain bullet list).
- `.stagerail`: decorative connecting line and nodes above the Stage
  1/2/3 grid (desktop only; static fill, never scroll-linked, so it
  never implies Stage 2/3 are live).
- `.stagecard.is-now` glow pulse: a slow breathing box-shadow on the
  active stage card.
- `.pricingstrip`: illustrative Stage-3 pricing math, animated via the
  site's existing `data-count` count-up utility (already used on the
  homepage; final values are in the static HTML, so no-JS/reduced-motion
  users see the correct numbers immediately).
- `.stepper` / `.formsection`: an onboarding progress stepper whose
  active step is tracked by a small `IntersectionObserver` block added
  to `main.js`, guarded so it only runs on pages with a `.stepper`.
- `.trustpanel`: a sticky-on-desktop, stacked-on-mobile aside with
  reassurance copy and links.
- Form validation motion: `.formfield--invalid` shake, wired up in
  `onboarding.js`/`login.js` by toggling a class (no validation-logic
  changes, no field renames).
- `.authnotice:not([hidden])`, `.statuspill`, and `.authcard`: pop/rise
  entrance animations that fire whenever those elements are unhidden or
  (re)rendered.
- `main.js` reveal system reused as-is (`[data-reveal]`, `--i` stagger)
  for hero/section entrances on all five pages, plus a new
  `MutationObserver` that re-runs the reveal check whenever any
  `[hidden]` attribute changes anywhere in the document. That's needed
  because several `[data-reveal]` blocks (auth/portal states) are only
  unhidden later by async Supabase session checks, well after the
  reveal system's initial timeouts.
- The research pipeline reuses the homepage's existing
  `.enginediagram__pipeline` traveling-beam component as-is (a new
  `.pipeline--5` column-count variant), rather than building a new
  diagram from scratch.

## A pre-existing bug fixed along the way

`.authnotice`, `.authcard`, and `.formgrid` each set their own
`display` (grid/flex). Per CSS origin rules, any author-defined
`display` on an element outranks the browser's built-in
`[hidden] { display: none }`, regardless of selector specificity or
source order. That meant every `hidden`-toggled auth/notice/form state
on these pages was actually rendering all at once (for example, login's
"already signed in" card stacked on top of the full sign-in form). This
predates Phase 5.1 (it was already present in the Phase 5 commit), but
it directly broke the new pop-in animations and the whole point of the
motion pass, so it's fixed here with a 3-line `[hidden] { display: none }`
override. No auth/JS behavior changed; it's purely a CSS specificity fix.
Verified with a headless-browser check before and after (screenshots in
this session's scratch directory).

## Mobile

Checked all five pages at a 390px viewport: no horizontal overflow on
any of them. The stage rail and pricing-strip glow are desktop-only
decorations; stage/role/benefit/portal cards fall back to the existing
single-column stacking. The onboarding stepper collapses to numbered
dots (labels hidden) with horizontal scroll if needed. The trust panel
drops its `position: sticky` below 980px and stacks under the form. No
interaction requires hover-only affordances; touch gets `:active` border
feedback in place of hover glow/tilt.

## Reduced motion

Every new keyframe animation is gated behind
`@media (prefers-reduced-motion: no-preference)`, on top of the site's
existing blanket `@media (prefers-reduced-motion: reduce) { * { animation-duration: 0.001ms !important; ... } }`
kill switch in `styles.css`, which already applies site-wide. Orb drift,
gradient-border/glow pulses, stage-rail ping, spotlight/tilt (also gated
on `hover: hover` and `pointer: fine` in `ambient.js`), and the count-up
strip all degrade to their static end state under reduced motion.

## Performance notes

- No new dependencies; everything is vanilla CSS/JS reusing patterns
  already in `styles.css`/`main.js`/`ambient.js`.
- Spotlight/tilt pointer tracking is delegated through the single
  existing `ambient.js` pointermove listener (rAF-throttled), not new
  per-card listeners.
- Orb backgrounds use `filter: blur()` and `transform` only
  (GPU-friendly, no layout thrash).
- The reveal `MutationObserver` only watches the `hidden` attribute
  (`attributeFilter: ['hidden']`), so it doesn't fire on unrelated DOM
  churn.

## Files changed

`partner.css`, `ambient.js`, `main.js`, `partners.html`, `onboarding.html`,
`onboarding.js`, `login.html`, `login.js`, `partner-portal.html`,
`partner-portal.js`, `research.html`, `docs/website_claims_audit.md`
(addendum for new copy), this file.

## Remaining rough spots

- The onboarding progress stepper still renders (in its neutral state)
  even when the form itself is hidden behind a config-error notice,
  since the stepper markup sits outside the `<form>`. This is cosmetic
  only, and only reachable in a local/unconfigured deployment.
- `/partner-portal`'s signed-in card grid could only be checked
  structurally and against the shared `.stagecard`/`.portalcard` styling
  already verified on `/partners`; a live Supabase session was not
  available in this environment to screenshot the populated state.

## Follow-up: research page "coming soon" panels

The Status/Abstract/Methodology/Selected-findings sections on
`/research` originally showed their unfinished state as raw bracket-tag
placeholders (`[PAPER_STATUS]`, `[ABSTRACT]`, `[METHODOLOGY_SUMMARY]`,
`[KEY_FINDINGS]`, `[SELECTED_FIGURES]`), styled with a dashed border and
monospace font, plus one line that was clearly an internal authoring
note ("Replace this paragraph with the paper's finalized methodology
summary."). That read as an unfilled CMS template rather than an
intentional page state, so it was replaced with a new `.comingsoon`
panel component: a status badge (pulsing dot for "genuinely nothing
here yet" states, static dot for "preliminary content that already
exists but will be superseded by the paper"), a heading where useful,
and clean prose with no bracket tags or internal notes. The
Selected-findings section's two near-duplicate placeholder blocks
(findings text, figures list) were merged into one panel. No factual
claims changed: same "not yet published" / "preliminary" / "simulated
under assumptions" / "not production savings or real facility
validation" language throughout; see the addendum to
`docs/website_claims_audit.md`. The old `.researchplaceholder` CSS
class (dashed border + monospace) was removed since nothing referenced
it anymore. Also fixed the stage-rail connecting line on `/partners` so
it runs through the center of the three stage dots instead of sitting
in a separate row above them, and replaced the remaining `--`
double-hyphen em-dash stand-ins in copy/comments I'd authored with real
punctuation (commas, colons, semicolons), per feedback.
