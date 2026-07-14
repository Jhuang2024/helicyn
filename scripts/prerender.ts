/**
 * Best-effort prerender for SEO.
 *
 * Snapshots the built SPA for the indexable marketing/document routes into
 * static `dist/<route>/index.html` files (with per-route <title>, meta,
 * canonical, and structured data injected by react-helmet-async), so search
 * engines and social scrapers see fully rendered HTML rather than an empty
 * shell. App/auth routes (noindex) are intentionally left as the SPA shell.
 *
 * This step is resilient: if a headless browser is unavailable it logs a
 * warning and exits 0: the SPA still serves every route via history fallback.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4199;
const ROUTES: { path: string; title: string }[] = [
  { path: '/', title: 'AI Coordination Layer' },
  { path: '/research', title: 'Research' },
  { path: '/partners', title: 'Founding Partners' },
  { path: '/patch-notes', title: 'Patch Notes' },
  { path: '/terms', title: 'Terms and Conditions' },
];
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

async function main() {
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch {
    console.warn('[prerender] playwright not available: skipping (SPA fallback still serves all routes)');
    return;
  }

  const server = spawn('node', [join(root, 'scripts/serve-dist.mjs'), String(PORT)], {
    stdio: 'ignore',
  });
  await new Promise((r) => setTimeout(r, 800));

  let browser;
  try {
    browser = await chromium.launch(existsSync(PINNED) ? { executablePath: PINNED } : {});
  } catch (err) {
    console.warn('[prerender] could not launch a browser: skipping:', (err as Error).message);
    server.kill();
    return;
  }

  const page = await browser.newPage();
  for (const route of ROUTES) {
    try {
      await page.goto(`http://localhost:${PORT}${route.path}`, { waitUntil: 'load', timeout: 15000 });
      // Wait for the page body to render (static content or a heading).
      await page.waitForSelector('main .static-content, main h1', { timeout: 8000 });
      // Wait for react-helmet-async to flush the route-specific <title> so the
      // snapshot captures the correct head (title, canonical, meta, JSON-LD).
      await page.waitForFunction(
        (t) => document.title.includes(t),
        route.title,
        { timeout: 8000 },
      );
      const html = '<!doctype html>\n' + (await page.evaluate(() => document.documentElement.outerHTML));
      const outDir =
        route.path === '/' ? join(root, 'dist') : join(root, 'dist', route.path.replace(/^\//, ''));
      mkdirSync(outDir, { recursive: true });
      writeFileSync(join(outDir, 'index.html'), html, 'utf8');
      console.log(`[prerender] wrote ${route.path}`);
    } catch (err) {
      console.warn(`[prerender] skipped ${route.path}:`, (err as Error).message);
    }
  }

  await browser.close();
  server.kill();
}

main().catch((err) => {
  console.warn('[prerender] non-fatal error:', err?.message ?? err);
  process.exit(0);
});
