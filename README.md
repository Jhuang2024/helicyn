# Helicyn: website & Control Plane

Helicyn is an AI coordination layer for data-center energy. This repository is
the marketing website plus the **Control Plane**: an interactive, simulation-
backed operator environment: built as a **React + TypeScript** application
(Vite, strict mode).

> This is a pre-commercial research preview. Everything in the Control Plane is
> illustrative, simulated data: not live customer telemetry or verified
> operational savings.

## Stack

- **Vite + React 18 + TypeScript** (strict), `react-router-dom` for routing.
- **react-helmet-async** for per-route SEO, with a best-effort static
  **prerender** of indexable routes so marketing content is in the rendered HTML.
- **Zustand** for the single authoritative Control Plane store.
- **Supabase** for authentication and application data.
- A **framework-independent TypeScript simulation engine** (no React) under
  `src/simulation`.
- No charting/UI framework: charts are small inline SVG; the visual identity is
  the original dark, instrument-panel design (legacy CSS reused verbatim + a
  consolidated token layer).

## Getting started

```bash
pnpm install
pnpm dev          # start the dev server (also generates the report body)
```

Open http://localhost:5173.

### Environment

Authentication needs a Supabase project. Copy `.env.example` and set:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-PUBLIC-ANON-KEY
```

The anon key is a **public** value protected by Row Level Security: never put a
service/secret key here. Without these, auth degrades gracefully (a clear
"not configured" message) and the rest of the site works. See
`docs/auth_setup.md`.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (generates `public/report-body.html` first) |
| `pnpm build` | Type-check, production build, then prerender indexable routes |
| `pnpm build:spa` | Build without the prerender step |
| `pnpm preview` | Preview the production build |
| `pnpm typecheck` | `tsc -b --noEmit` (strict) |
| `pnpm lint` | ESLint |
| `pnpm test` | Unit + integration tests (Vitest) |
| `pnpm test:e2e` | End-to-end tests (Playwright, desktop + mobile) |

## Project layout

```
src/
  app/            App, router, ThemeProvider, AuthProvider, version source
  components/
    common/       SitePointerGlow, RevealOnScroll, MagneticButton,
                  InteractiveSurface, Seo, AuthGate
    layout/       Layout, Nav, Footer, ScrollProgress, CommandPalette, …
    control-plane/ Every Control Plane module + inline SVG charts
  hooks/          usePointerGlow, useReveal, usePrefersReducedMotion
  pages/          One component per route (+ _static/ for ported legacy bodies)
  services/       Supabase client + auth/application-data service
  simulation/     Framework-independent engine (see docs/simulation_architecture.md)
    engine/       prng, constants, accumulation, compute, engine
    models/       types
    scenarios/    scenario registry, recommendation pool, workload pool
    selectors/    derived-value selectors
  state/          controlPlaneStore (Zustand, versioned persistence)
  styles/         global.css (reused legacy CSS) + tokens.css + components.css
                  + control-plane.css
  tests/          Vitest setup
legacy/           The original vanilla site, kept for parity reference
public/           Static assets (favicons, og-image, images, sitemap, _redirects)
scripts/          extract-report, prerender, serve-dist
e2e/              Playwright specs
```

## Routing & deployment

All original public URLs are preserved. The app is statically hosted:

- Indexable marketing/document routes are **prerendered** to
  `dist/<route>/index.html` for SEO.
- `public/_redirects` keeps the legacy 301s (old `.html`/space-encoded URLs) and
  adds a history fallback (`/* /index.html 200`) so direct loads and refreshes
  resolve on every client route.

Deploy the contents of `dist/` to any static host that honours `_redirects`
(e.g. Netlify), or replicate the redirect rules on your host.

## Documentation

- `docs/simulation_architecture.md`: the simulation engine and store.
- `docs/extending_the_control_plane.md`: how to add a scenario, a metric, or a
  recommendation type.
- `docs/auth_setup.md`: Supabase setup.

## Testing & verification

`pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`
all pass. The e2e suite runs against the production build at desktop and mobile
widths and asserts no application console errors.
