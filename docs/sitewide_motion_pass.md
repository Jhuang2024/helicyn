# Site-wide microinteraction / motion pass

Follow-up to `docs/phase_5_1_new_pages_motion_pass.md`, which was scoped
to the five new founding-partner pages only. This pass covers the rest
of the site: `index.html` (homepage) and `control-plane.html` (the
interactive simulator demo), plus a couple of shared/global fixes in
`styles.css` that benefit every page's footer.

Scope: add microinteractions/animation, fix a couple of real bugs
found along the way, and improve consistency between homepage and
control-plane. No auth/database/onboarding/simulator-equation logic
touched; no page redesigned structurally.

## Real bugs fixed

- **`.cp-ba` (Before/After Helicyn panel, control-plane.html) was
  completely static and disconnected from the rest of the page's data
  pipeline**: every neighboring section (topology, recommendations,
  telemetry, `.demo-cmp` bars) is scenario-reactive or at least
  animated, but this one had no JS reference anywhere and no reveal
  choreography beyond the outer panel fading in as one block. Added
  `data-count` count-up to the five clean numeric values (PUE, cooling
  %, one thermal variance reading) and a per-row "converge from
  opposite sides" reveal, reusing the exact animation already built for
  the homepage's local-vs-fleet comparison (`styles.css`
  `.compare__list li`). Left the comma-formatted cost figures, the
  text-only risk labels ("Elevated"/"Stable"), and the one row with a
  nested tooltip button out of the count-up (the shared `[data-count]`
  regex doesn't parse thousands separators or text, and count-up would
  have clobbered the tooltip button's markup); those three rows still
  get the row-reveal animation, just not the number tween.
- **Two SVG brand-mark dots were missing their `class="dot"`**
  (control-plane.html's nav and footer), so the existing
  `brandBreathe` pulse animation silently never applied there even
  though it's been running on every other brand mark site-wide.
- **Footer brand mark had no `data-magnetic` on control-plane.html**
  (present on every other page's footer).
- **Assumptions drawer (`.cp-assume`) rendered `open` by default**,
  dumping the largest static text block on the page into view
  immediately instead of being a disclosure to discover. No JS
  referenced the `open` attribute (confirmed via grep across
  `control.js`/`scenario.js`), so it was safe to drop. Added a fade/
  slide-in animation for the grid content on open so the toggle itself
  now reads as a deliberate motion instead of an instant snap.
- **Control-plane.html's header canvas never reacted to the cursor.**
  `hero.js`'s pointer-deflection/reticle code was gated on
  `document.querySelector('.hero')`, which only matches the homepage;
  `control-plane.html` renders the identical `#field` canvas inside
  `.control-head` but got the idle ambient loop only, never the
  cursor-reactive one, and had no `.reticle` element at all. Widened
  the selector to `.hero, .control-head` (one line) and added the
  `.reticle` div to control-plane.html's header markup (`.reticle` is
  already a shared, globally-styled class, so no new CSS was needed). The
  homepage's separate `#heroLogo` 3D-tilt effect is untouched since
  that element genuinely only exists there.

## Consistency: spotlight glow on tilt-only cards

`.signalboard__tile` (Signal intake board) and `.enginediagram__step`
(Coordination engine diagram) already had cursor-tracked 3D tilt via
`ambient.js`, but were missing the cursor-tracked spotlight glow
overlay that visually near-identical cards elsewhere (`.cap`,
`.archstack__panel`, `.cpcta__panel`) already have. Added both
selectors to `ambient.js`'s `CARD_SEL` (their existing tilt wiring in
`TILT_SEL` was already there) and mirrored the existing
`.archstack__panel::after`-style spotlight CSS in `styles.css`,
including the reduced-motion kill switch. No new JS.

## New microinteractions

- **Manifesto/thesis section** (homepage): the lead line was pure text
  with no visual accent anywhere on the page's "breathing room"
  sections. Added a quote-bar accent (`.manifesto__lead::before`) that
  grows in height right after the lead line's own mask-reveal
  finishes, so the two moments read as one choreographed beat. Also
  added magnetic hover to the "Thesis status" / "Research page"
  buttons, which had been missed.
- **Status band**: went from fully static (aside from the live clock
  and one ping dot) to a staggered reveal per item plus a hover state
  that brightens the label/value text.
- **Current-state chips**: added hover lift + border/background glow,
  matching the hover language used on chips/pills elsewhere on the
  site.
- **Access form**: the email field's focus state was a flat
  border-color swap; replaced it with an animated underline that grows
  from the center outward in the signal-blue accent, matching the
  premium input treatment already built for the founding-partner
  pages. The role-picker pills got a small hover lift, a selection
  glow, and a brief pop animation when checked.
- **Footer** (all 7 pages): added a light stagger reveal to the brand
  block and the two link columns, and an arrow-nudge hover on links
  that carry a `.arr` (LinkedIn's `↗`, footer arrows elsewhere).
  Previously only `.navlink` had that nudge; footer links had the
  underline sweep but not the arrow motion.

## On "premium images"

The site is intentionally 100% SVG/CSS with zero photography (verified
by grep: no `<img>` tags, no photo `background-image` anywhere except
the two favicons and the OG social-share image, none of which render
in-page). The homepage and control-plane already carry the site's
"imagery" load through custom SVG (`.heroscene`, the topology world
map, sparklines/trend charts) concentrated in a handful of showcase
sections. The plainer sections flagged in the survey (manifesto,
status band, current-state, access form) are deliberately text-only
"breathing room" between those showcase moments; that's a rhythm
choice in the existing design, not an oversight. Rather than bolt on
new illustration assets that risk reading as inconsistent or
decorative-for-its-own-sake, this pass extended the site's *existing*
motion language (spotlight sheen, accent bars, reveal choreography)
into those sections instead. Happy to design an actual new SVG
illustration for a specific spot if you point at one you want visually
heavier.

## Mobile / reduced motion

Checked `index.html` and `control-plane.html` at 390px: zero
horizontal overflow, before and after. Every new animation is gated
behind `@media (prefers-reduced-motion: no-preference)` (or degrades to
its finished static state under `reduce`, verified for the manifesto
accent bar specifically via Playwright with `reducedMotion: 'reduce'`
emulation). No new hover-only interactions: the `.cp-ba` row reveal,
footer stagger, and status-band stagger are all scroll-triggered, not
hover-gated.

## Files changed

`index.html`, `control-plane.html`, `styles.css`, `control.css`,
`hero.js`, `ambient.js`, plus a `data-reveal` stagger added to the
footer markup of `login.html`, `onboarding.html`, `partner-portal.html`,
`partners.html`, `research.html` (their footer is byte-for-byte the
same markup as the homepage's, so the same reveal treatment applies
there for free).

## Verified

- `node --check` on every touched `.js` file
- CSS brace-balance check on `styles.css`/`control.css`/`partner.css`
- HTML structural well-formedness on all 7 pages + `control-plane.html`
- Headless-browser pass (desktop + 390px mobile) on `index.html` and
  `control-plane.html`: zero console errors from new code, zero
  horizontal overflow
- `helicyn-sim` test suite: 92/92 passed (untouched by this pass;
  re-run as a sanity check)
- Claims-safety grep sweep on every added line: no new unqualified
  claims
