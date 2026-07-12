import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

const PORT = 4188;

// Use the pre-installed Chromium in this environment (avoids a version-pinned
// re-download). Falls back to Playwright's bundled browser elsewhere.
const PINNED = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROMIUM = existsSync(PINNED) ? PINNED : undefined;

/**
 * End-to-end config. Serves the production build (with SPA fallback so direct
 * loads and refreshes on client routes resolve) and runs the smoke suite at
 * desktop and mobile widths.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], launchOptions: { executablePath: CHROMIUM } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'], launchOptions: { executablePath: CHROMIUM } },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
