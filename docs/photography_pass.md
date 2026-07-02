# Photography pass

Real photos, provided directly by the user (pushed to `main` as
`abstract infrastructure.jpeg`, `renewable energy.jpeg`, `ai chips.jpeg`,
`fibre networking.jpeg`, `power infrastructure.jpeg`,
`cooling infrastructure.jpeg`, `server aisle.jpeg`, `datacentre.jpeg`,
`gpu infrastructure.jpeg`). This session could not fetch or verify any
external image (network and `WebFetch` both blocked on every host
tried), so these are the first real photography on the site, sourced
entirely from what the user supplied.

## Processing

Resized and re-encoded the 8 images actually used (Pillow, JPEG quality
78, progressive) into `images/`, cutting file size by roughly 60-85%
per image (for example `ai chips.jpeg` 498KB down to 73KB as
`images/compute.jpg`). Removed the oversized, space-named originals
from the repo once the optimized replacements existed, to avoid
shipping both. `renewable energy.jpeg` is left untouched, unused, at
the repo root: its warm sunset tones don't fit the site's cold-blue
palette and there wasn't a placement worth forcing it into.

| Original | Used as |
|---|---|
| `ai chips.jpeg` | `images/compute.jpg` |
| `power infrastructure.jpeg` | `images/energy.jpg` |
| `cooling infrastructure.jpeg` | `images/cooling.jpg` |
| `datacentre.jpeg` | `images/facility.jpg` |
| `server aisle.jpeg` | `images/server-aisle.jpg` |
| `fibre networking.jpeg` | `images/fibre-networking.jpg` |
| `gpu infrastructure.jpeg` | `images/gpu-infrastructure.jpg` (saved, not yet placed) |
| `abstract infrastructure.jpeg` | `images/abstract-infrastructure.jpg` (saved, not yet placed) |
| `renewable energy.jpeg` | not used |

## Treatment

The site is otherwise 100% SVG/CSS with a deliberately monochrome,
rare-signal-blue palette, so real photography needed a uniform
treatment to read as part of the same system instead of a pasted-in
stock photo. Same recipe everywhere a photo appears:

1. `filter: grayscale(0.82) brightness(0.6) contrast(1.18)` on the
   `<img>` itself, desaturating and darkening it.
2. A `mix-blend-mode: color` overlay in the site's `--signal` blue,
   which tints the grayscale image's luminosity, the standard duotone
   technique. This is what makes a bright daytime aerial substation
   photo and an already-dark GPU render land in the same visual family.
3. A bottom gradient fading into the surrounding background color, so
   the image edge blends rather than hard-cuts, and so any caption
   text sitting on top stays legible.
4. A slow `scale(1.055)` zoom + slight filter lift on hover
   (fine-pointer only), matching the restrained hover language used
   for every other card on the site.

## Where they were placed, and why

- **Homepage, new section between the manifesto and capabilities**: a
  4-image band, Compute / Energy / Cooling / Facility. Placed directly
  under the manifesto's own sentence ("It will coordinate compute,
  energy, cooling, and physical constraints as one system"), so the
  photos visually confirm a claim the copy already makes rather than
  introducing a new one. No new heading or paragraph copy was added:
  each photo carries only a one-word caption pulled from that existing
  sentence.
- **`/partners`, the "Who this is for" role cards**: added a cover
  photo to the four cards with an unambiguous visual match (Data
  center operators, AI infrastructure teams, Cloud/platform teams,
  Energy & cooling infrastructure teams). Left "Research / advisory
  partners" and "Investors / advisors" as plain text cards; there's no
  honest photo for either without reaching.

`gpu-infrastructure.jpg` and `abstract-infrastructure.jpg` are
processed and sitting in `images/` but not placed anywhere yet. Both
are strong images, but I didn't find a section where adding one
wouldn't mean displacing or competing with something that's already
working (control-plane.html's header already carries a lot of visual
weight from its own canvas animation; research.html's hero already has
the orb/constellation treatment from the last pass). Available if a
specific spot comes up.

## Verified

- No copy changed: diffed every touched file's removed lines and
  confirmed the four role-card deletions are the same title/paragraph
  text, just re-wrapped around the new image markup
- Claims-safety grep sweep on the diff: clean (all new copy is a
  single-word caption or an empty `alt=""` on decorative images that
  duplicate adjacent text)
- CSS brace-balance and HTML well-formedness checks
- Headless-browser pass on `index.html` and `partners.html`: zero
  console errors (images load, confirmed via direct fetch too), zero
  horizontal overflow, desktop and 390px mobile
- Reduced-motion emulation: zero overflow, hover-only zoom already
  gated to `(hover: hover) and (pointer: fine)` so touch never gets an
  uncontrollable hover-lock

## Files changed

`styles.css`, `partner.css`, `index.html`, `partners.html`, plus the
new `images/` directory and removal of the eight now-redundant
original uploads.
