import { test, expect, type Page } from '@playwright/test';

/**
 * Browser smoke journeys against the real UI SPA with the API stubbed at the
 * network boundary (page.route). Verifies the app actually boots, routes, and
 * renders in Chromium — complementing the API-level create→edit→publish journey
 * in tests/e2e/editor-workflows.test.ts.
 */

const orgInfo = {
  success: true,
  data: { organization: { name: 'Testville', city: 'Testville' } },
};

const recordsList = {
  success: true,
  data: {
    records: [
      {
        id: 'rec-1',
        title: 'Budget Bylaw 2026',
        type: 'bylaw',
        status: 'published',
        updated_at: '2026-01-02T00:00:00Z',
      },
    ],
    total: 1,
    page: 1,
    pageSize: 10,
  },
};

/** Fulfil every /api/v1/* call the SPA makes with a fixture. */
async function stubApi(page: Page) {
  await page.route('**/api/v1/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/info')) return route.fulfill({ json: orgInfo });
    if (url.includes('/auth/me')) return route.fulfill({ status: 401, json: { success: false } });
    if (url.includes('/records')) return route.fulfill({ json: recordsList });
    return route.fulfill({ json: { success: true, data: {} } });
  });
}

test.beforeEach(async ({ page }) => {
  await stubApi(page);
});

test('the app boots and hydrates in a real browser', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.ok()).toBeTruthy();
  await expect(page).toHaveTitle(/civicpress/i);
  // The SPA actually rendered its content (not a white-screen crash).
  await expect(
    page.getByText(/open infrastructure for accountable local government/i)
  ).toBeVisible();
});

test('the records browser renders a record from the API', async ({ page }) => {
  await page.goto('/records');
  await expect(page.getByText('Budget Bylaw 2026')).toBeVisible();
});

test('the login page renders its username + password form', async ({ page }) => {
  await page.goto('/auth/login');
  // Assert on CSS-visible text: a cookie-consent modal marks the rest of the
  // page aria-hidden/inert, so role/label locators can't see the form, but its
  // text still renders. This is the username/password login form.
  await expect(page.getByText('Username & Password')).toBeVisible();
  await expect(
    page.getByText(/sign in with your username and password/i)
  ).toBeVisible();
});
