# Illustration and depth pass

Follow-up to `docs/sitewide_motion_pass.md`. Scope this time: add
illustration and visual depth across the site, since it was flagged as
the one thing missing everywhere. Two hard constraints throughout: no
feature/behavior changes, and no copy changes. Every edit in this pass
is either a new decorative element (marked `aria-hidden="true"`, never
altering visible text) or a CSS-only depth/texture treatment.

## New reusable components (`styles.css`, loaded on every page)

- **`.constellation`**: a small abstract node/line illustration, same
  visual grammar as the homepage's `.heroscene` (thin strokes, ring +
  dot nodes, signal-blue accent, soft pulses) but unlabeled and
  simpler, a texture rather than a diagram. Built as inline SVG so it
  costs nothing extra to load and matches how every other illustration
  on the site is already built (the hero scene and the control-plane
  topology map are both inline SVG too; the site has zero raster
  images or icon fonts).
- **`.gridwash`**: the exact grid-texture recipe already used for
  `.hero__scene`, `.control-head`, and `.cpcta__panel`, extracted into
  a standalone opt-in class so a section can carry that same
  "instrument panel" surface without needing the cursor-tracked
  ambient layer those three already have.
- A small card-depth rule adding a resting ambient shadow to the
  site's main card families (`.cap`, `.archstack__panel`,
  `.compare__col`, `.cpcta__panel`, `.signalboard__tile`,
  `.enginediagram__step`, `.rolecard`, `.stagecard`, `.portalcard`,
  `.benefitcard`), so raised surfaces read with depth at rest, not
  only on hover. Each card's own hover shadow still applies on top of
  this (equal-or-higher specificity via `:hover`), unchanged.

Both `.constellation` and `.gridwash` degrade gracefully: their pulse/
flow animations are gated behind `@media (prefers-reduced-motion:
no-preference)`, and the site's existing blanket reduced-motion kill
switch in `styles.css` covers them regardless.

## Where they were applied

- **Homepage manifesto/thesis section**: was pure text with the new
  accent bar from the previous pass and nothing else. Added a
  `.gridwash` behind the whole section and a `.constellation` in the
  open space to the upper right, low opacity, sitting behind the text
  (verified it doesn't reduce legibility of the paragraph copy it
  overlaps).
- **Homepage current-state section**: added a smaller `.constellation`
  variant in the left margin.
- **All five founding-partner pages' hero sections** (`partners.html`,
  `onboarding.html`, `login.html`, `partner-portal.html`,
  `research.html`): each previously had only the flat `.orbfield` glow
  from the last pass. Added a `.constellation` alongside it, one of
  three hand-placed node layouts (a fuller 5-node version for the
  flagship `/partners` and `/research` pages, a 4-node version for
  `/onboarding` and `/partner-portal`, a minimal 3-node version for
  `/login` to match its cleaner, simpler page). All hidden below
  ~980px so they never compete with stacked mobile content.

Deliberately did *not* blanket every section with `.gridwash` or a
`.constellation`. The existing design already uses the grid-texture
treatment sparingly, only on a handful of "featured" panels, and the
plainer sections (access form, status band, founding-partner-program)
already carry enough visual weight from their own cards/pills after
the previous motion pass. Piling texture onto everything would read as
noise rather than craft, so this pass targeted specifically the
sections/pages that had *zero* illustration of any kind.

## Verified

- No text content changed: diffed every touched file's removed lines
  and confirmed the only two deletions were CSS rules replaced by
  expanded versions of themselves (not copy)
- CSS brace-balance and HTML well-formedness checks on every touched
  file
- Headless-browser pass on all 7 HTML pages plus `control-plane.html`
  (desktop and 390px mobile): zero console errors, zero horizontal
  overflow
- Reduced-motion emulation: zero overflow, no errors
- Constellation illustrations confirmed hidden (`display: none`) below
  the mobile breakpoint on every page that has one

## Files changed

`styles.css`, `partner.css`, `index.html`, `partners.html`,
`onboarding.html`, `login.html`, `partner-portal.html`,
`research.html`.
