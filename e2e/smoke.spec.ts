import { test, expect } from '@playwright/test';

/**
 * Collect real JavaScript console errors (acceptance #12). External resource
 * failures (Google Fonts, analytics) are ignored — outbound CDN requests are
 * blocked in the offline test sandbox and are not application errors.
 */
function trackConsole(page: import('@playwright/test').Page): string[] {
  const errors: string[] = [];
  const isNetworkNoise = (t: string) =>
    /Failed to load resource|ERR_TUNNEL_CONNECTION_FAILED|ERR_CONNECTION|net::|fonts\.googleapis|googletagmanager|gstatic/i.test(
      t,
    );
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !isNetworkNoise(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    if (!isNetworkNoise(err.message)) errors.push(err.message);
  });
  return errors;
}

test('homepage renders with nav, headings, and footer', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/');
  await expect(page).toHaveTitle(/Helicyn/);
  await expect(page.locator('header.nav .brand__name')).toHaveText('Helicyn');
  // Key homepage headings are present (content parity).
  await expect(page.getByRole('heading', { name: 'Eight signals, one board.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'From signal to verified action.' })).toBeVisible();
  await expect(page.locator('footer.footer')).toContainText('© 2026 Helicyn');
  await expect(page.locator('footer.footer')).toContainText('v1.1.0');
  expect(errors).toEqual([]);
});

test('direct load of a client route resolves (SPA fallback)', async ({ page }) => {
  await page.goto('/research');
  await expect(page).toHaveTitle(/Research/);
  await expect(page.locator('.static-content')).toBeVisible();
});

test('clipped-descender headings are not visually clipped', async ({ page }) => {
  await page.goto('/');
  const heading = page.getByRole('heading', { name: 'Eight signals, one board.' });
  await heading.scrollIntoViewIfNeeded();
  // Wait for the reveal to complete (class toggled by the shared enhancer).
  await expect(heading).toHaveClass(/is-(revealed|visible)/);
  // The revealed heading must not clip: overflow visible and no active clip-path.
  const style = await heading.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { overflow: cs.overflow, clip: cs.clipPath };
  });
  expect(style.overflow).not.toBe('hidden');
  expect(['none', 'auto', '']).toContain(style.clip);
});

test('pointer backdrop exists on report and follows the pointer', async ({ page }) => {
  await page.goto('/report');
  await expect(page.locator('.site-pointer-glow')).toBeAttached();
  // Move the pointer and confirm the CSS custom property updates.
  await page.mouse.move(200, 200);
  await page.mouse.move(600, 400);
  await page.waitForTimeout(200);
  const x = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--pointer-x'));
  expect(x.trim().length).toBeGreaterThan(0);
});

test('control plane: app shell renders and scenario switch updates every module', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/control-plane');
  await expect(page.getByRole('heading', { name: 'Helicyn Control Plane' })).toBeVisible();
  // Shell regions: control bar, view nav, canvas, inspector, event stream.
  await expect(page.locator('.cps-bar')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Control Plane views' })).toBeVisible();
  await expect(page.locator('.cps-canvas')).toBeVisible();
  await expect(page.locator('.cps-inspector')).toBeVisible();
  await expect(page.locator('.cps-stream')).toBeVisible();

  // The default scenario alert (Overview pulse).
  await expect(page.locator('.cp-alert').first()).toContainText('Systems nominal');

  // Switch scenario → alert, inspector trace, and event stream all update.
  await page.getByRole('button', { name: 'Operating scenario' }).click();
  await page.getByRole('option', { name: /Cooling Constraint/ }).click();
  await expect(page.locator('.cp-alert').first()).toContainText('Cooling constraint');
  await expect(page.locator('.cp-trace__action')).toContainText('ACTION #233');
  // The switch is recorded exactly once in the event stream.
  await expect(page.locator('.cps-event__title', { hasText: 'Scenario loaded' })).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('control plane: approve → simulate flows through queue and verification', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/control-plane?view=recommendations');
  const firstRec = page.locator('.cp-rec').first();
  await firstRec.getByRole('button', { name: 'Approve in simulation' }).click();
  // Approval propagates to the shared status pill and the event stream.
  await expect(page.locator('.cps-status')).toContainText('Action staged');
  await expect(page.locator('.cps-event__title', { hasText: 'Operator approved' })).toHaveCount(1);
  await firstRec.getByRole('button', { name: 'Simulate' }).click();

  // Same state, different view — switching views never resets the simulation.
  await page.getByRole('navigation', { name: 'Control Plane views' }).getByRole('button', { name: 'Results' }).click();
  await expect(page.locator('.cp-verify__body')).toBeVisible();
  await expect(page.locator('.cp-verify__status').first()).toContainText('Verified in simulation');
  await expect(page.locator('.cp-queue__col').nth(1)).not.toContainText('No actions approved yet');
  expect(errors).toEqual([]);
});

test('control plane: selecting a region synchronizes the inspector', async ({ page }) => {
  await page.goto('/control-plane?view=regions');
  await page.locator('.cp-region').first().click();
  await expect(page.locator('.cps-inspector')).toContainText('OREGON');
  await expect(page.locator('.cps-inspector')).toContainText('Available capacity');
});

test('control plane: changing a control recomputes metrics', async ({ page }) => {
  await page.goto('/control-plane');
  const energy = page.locator('.cp-metric').first().locator('.cp-metric__value');
  const before = await energy.textContent();
  const nav = page.getByRole('navigation', { name: 'Control Plane views' });
  await nav.getByRole('button', { name: 'Actions' }).click();
  await page.getByRole('button', { name: 'Aggressive' }).click();
  await nav.getByRole('button', { name: 'Overview' }).click();
  await expect(energy).not.toHaveText(before ?? '');
});

test('mobile: control plane has no horizontal overflow', async ({ page }) => {
  await page.goto('/control-plane');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 2,
  );
  expect(overflow).toBe(true);
});
