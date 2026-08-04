import { defineConfig, devices } from '@playwright/test';

/**
 * Browser end-to-end tests. These drive the REAL CivicPress web UI (the Nuxt
 * SPA) in a real Chromium — the layer the vitest component tests and the
 * supertest API-level journey tests (tests/e2e/) can't reach: real routing,
 * hydration, and rendering in a browser. The API is intercepted with fixtures
 * inside each spec, so no live backend/DB is required.
 *
 * Local run:
 *   npx playwright install chromium         # one-time
 *   npx playwright test                     # auto-starts the UI dev server
 *
 * The UI port is overridable via CIVIC_E2E_PORT (default 3041). If a UI server
 * is already listening there, Playwright reuses it.
 */
const PORT = process.env.CIVIC_E2E_PORT || '3041';
// Local default: the Nuxt dev server (no build needed). CI overrides this with
// the built preview (`pnpm --filter @civicpress/ui run preview`) after a build.
const WEBSERVER =
  process.env.CIVIC_E2E_WEBSERVER || `pnpm --filter @civicpress/ui run dev`;

export default defineConfig({
  testDir: './tests/e2e-browser',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    headless: true,
    trace: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: WEBSERVER,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
    env: { PORT, NUXT_PORT: PORT },
  },
});
