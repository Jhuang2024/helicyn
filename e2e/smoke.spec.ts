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

test('control plane: scenario switch updates every module', async ({ page }) => {
  const errors = trackConsole(page);
  await page.goto('/control-plane');
  await expect(page.getByRole('heading', { name: 'Helicyn Control Plane' })).toBeVisible();

  // The default scenario alert.
  await expect(page.locator('.cp-alert')).toContainText('Systems nominal');

  // Switch scenario → alert, trace, and topology all update.
  await page.getByRole('button', { name: 'Operating scenario' }).click();
  await page.getByRole('option', { name: /Cooling Constraint/ }).click();
  await expect(page.locator('.cp-alert')).toContainText('Cooling constraint');
  await expect(page.locator('.cp-trace__action')).toContainText('ACTION #233');
  expect(errors).toEqual([]);
});

test('control plane: approve → simulate updates the queue and verification', async ({ page }) => {
  await page.goto('/control-plane');
  const firstRec = page.locator('.cp-rec').first();
  await firstRec.getByRole('button', { name: 'Approve in simulation' }).click();
  await expect(page.locator('.cp-queue__col').first()).not.toContainText('No actions awaiting');
  await firstRec.getByRole('button', { name: 'Simulate' }).click();
  await expect(page.locator('.cp-verify__body')).toBeVisible();
  await expect(page.locator('.cp-verify__status')).toContainText('Verified in simulation');
});

test('control plane: changing a control recomputes metrics', async ({ page }) => {
  await page.goto('/control-plane');
  const energy = page.locator('.cp-metric').first().locator('.cp-metric__value');
  const before = await energy.textContent();
  await page.getByRole('button', { name: 'Aggressive' }).click();
  await expect(energy).not.toHaveText(before ?? '');
});

test('mobile: control plane has no horizontal overflow', async ({ page }) => {
  await page.goto('/control-plane');
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth <= window.innerWidth + 2,
  );
  expect(overflow).toBe(true);
});
