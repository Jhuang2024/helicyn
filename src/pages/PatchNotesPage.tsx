import { Seo } from '@/components/common/Seo';
import { StaticContent, extractMain } from './_static/StaticContent';
import { VERSION, BUILD_SHORT } from '@/app/version';
import rawPatchNotes from '../../legacy/patch-notes.html?raw';

/**
 * The new release entry for the React migration. Every claim here corresponds to
 * work that is actually implemented and verified (build + tests) in this
 * release — no aspirational items. It keeps the "research preview" framing.
 */
const NEW_ENTRY_HTML = `
      <article class="patchcard pglow-ring" data-reveal style="--i:0" data-tag="Product">
        <div class="patchcard__meta">
          <time class="mono patchcard__date" datetime="2026-07-12">July 12, 2026</time>
          <span class="patchtag">Product</span>
          <span class="patchtag">Design</span>
          <span class="patchtag">Performance</span>
          <span class="patchtag">Fixes</span>
          <span class="pbadge pbadge--signal">Latest</span>
          <span class="mono patchcard__read">2 min read</span>
        </div>
        <h3 class="patchcard__title">React migration and Control Plane architecture upgrade</h3>
        <ul class="patchcard__body">
          <li>Migrated the site from vanilla HTML/CSS/JavaScript to a React + TypeScript application (Vite, strict mode). Every existing route, page, section, form, and piece of copy is preserved, and direct loads and browser refreshes keep working on all URLs.</li>
          <li>Introduced shared, reusable page and interaction components — a single site-wide pointer backdrop, scroll-reveal, magnetic buttons, and interactive card spotlights — used identically across every route instead of per-page copies.</li>
          <li>Extracted the Control Plane simulation into a framework-independent, deterministic TypeScript engine (seeded, no <code>Math.random</code> in the core math) with a full operator surface and unit tests. React now renders state; the engine calculates it.</li>
          <li>Centralized all Control Plane state in one authoritative store, so changing the scenario, selecting a region, adjusting controls, or approving an action updates every panel consistently — with stale state prevented on scenario reset.</li>
          <li>Upgraded the scenario system (deterministic seeds, descriptions, pause/resume, speed and step controls, simulation clock, and a clear accumulated-vs-projected distinction), the regional topology (state-coded regions, animated workload flows, linked selection, richer tooltips), recommendations and the operator queue (a real lifecycle with separated lanes), workload orchestration (explicit states that propagate through the fleet), and verification and telemetry (baseline-vs-coordinated, charts driven by simulation history).</li>
          <li>Improved the mobile Control Plane layout so every module stays usable without horizontal overflow.</li>
          <li>Restored the site-wide pointer backdrop and interaction effects on the technical report page, which previously felt like an older version of the site, while keeping the document fully readable.</li>
          <li>Fixed clipped lowercase descenders on section headings (including "Eight signals, one board." and "From signal to verified action.") at the root — a shared, descender-safe heading and reveal system — and audited every other heading and route for the same problem.</li>
          <li>Accessibility and performance improvements: semantic landmarks, keyboard-accessible controls, reduced-motion support, route-level code splitting, and lazy-loaded visualization code so reading a static page never downloads the Control Plane bundle.</li>
          <li>Verified through type checking, linting, automated tests, and a production build. Version bumped to v${VERSION}.</li>
        </ul>
      </article>
`;

function buildPatchNotesMain(): string {
  let main = extractMain(rawPatchNotes);
  // Demote the previous "Latest" entry: drop its highlight ring and badge.
  main = main.replace('<span class="pbadge pbadge--signal">Latest</span>', '');
  main = main.replace('patchcard pglow-ring', 'patchcard');
  // Insert the new release at the top of the changelog list.
  main = main.replace('<div class="patchlist">', '<div class="patchlist">' + NEW_ENTRY_HTML);
  // Keep the header build chip in sync with the shared version source.
  main = main.replace(/Build v[0-9.]+ · [0-9.]+/g, `Build v${VERSION} · ${BUILD_SHORT}`);
  return main;
}

const MAIN = buildPatchNotesMain();

export default function PatchNotesPage() {
  return (
    <div className="page page--patchnotes">
      <Seo
        title="Helicyn · Patch Notes"
        description="Patch notes for Helicyn's AI coordination layer: product updates, design changes, and fixes to data center energy and GPU workload scheduling, newest first."
        canonicalPath="/patch-notes"
        ogType="website"
        twitterCard
      />
      <StaticContent html={MAIN} />
    </div>
  );
}
