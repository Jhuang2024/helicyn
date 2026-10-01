import { test, expect } from '@playwright/test';
import { VERSION_LABEL } from '../src/app/version';

test.use({ reducedMotion: 'reduce' });
for (const route of ['/', '/research', '/report', '/partners', '/careers', '/patch-notes', '/terms', '/login', '/onboarding', '/profile', '/partner-portal', '/auth-callback', '/control-plane']) {
  test(`audit direct route ${route}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(route);
    await expect(page.getByRole('main').getByRole('heading').first()).toBeVisible();
    await expect(page).toHaveTitle(/Helicyn/);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true);
    expect(errors).toEqual([]);
    if (['/', '/control-plane', '/patch-notes', '/report'].includes(route)) {
      await page.screenshot({ path: testInfo.outputPath(`audit-${route.replaceAll('/', '') || 'home'}.png`), fullPage: true });
    }
  });
}

test('report figures remain available without embedded image payloads', async ({ page }) => {
  await page.goto('/report');
  const images = page.locator('.report-static img[src^="/report-assets/"]');
  await expect(images).toHaveCount(17);
  await expect(page.locator('.report-static img[src^="data:"]')).toHaveCount(0);
  const first = images.first();
  await first.scrollIntoViewIfNeeded();
  await expect.poll(() => first.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
});

test('search handles empty results and traps keyboard focus', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const input = page.getByRole('combobox');
  await expect(input).toBeFocused();
  await input.fill('no-matching-route-123');
  await input.press('ArrowDown');
  await input.fill('research');
  await input.press('Enter');
  await expect(page).toHaveURL(/\/research$/);
  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.press('Shift+Tab');
  await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible();
  expect(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('scenario selector supports arrow keys and Enter', async ({ page }) => {
  await page.goto('/control-plane');
  const button = page.getByRole('button', { name: 'Operating scenario' });
  await button.focus();
  await button.press('ArrowDown');
  await expect(page.getByRole('listbox', { name: 'Operating scenario' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(button).toBeFocused();
  await expect(button).toContainText('Cooling Constraint');
});

test('patch notes show the release in each applicable category', async ({ page }) => {
  await page.goto('/patch-notes');
  for (const category of ['Fixes', 'Security', 'Performance', 'Design']) {
    await page.getByRole('button', { name: category, exact: true }).click();
    await expect(page.locator('.patchcard').filter({ hasText: VERSION_LABEL }).first()).toBeVisible();
  }
});

test('server preserves legacy redirects and rejects missing assets', async ({ request }) => {
  expect((await request.get('/definitely-missing.png')).status()).toBe(404);
  const legacy = await request.get('/research.html?ref=audit', { maxRedirects: 0 });
  expect(legacy.status()).toBe(301);
  expect(legacy.headers().location).toBe('/research?ref=audit');
});

test.describe('public prerender', () => {
  test.use({ javaScriptEnabled: false });
  for (const route of ['/research', '/report', '/partners', '/patch-notes', '/terms']) {
    test(`has route metadata and content without JavaScript: ${route}`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('main h1').first()).toBeVisible();
      await expect(page.locator('meta[name="description"]')).toHaveCount(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://helicyn.com${route}`);
    });
  }
});
