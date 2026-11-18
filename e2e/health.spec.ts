import { expect, test } from '@playwright/test';

test('the home page loads and shows the server health status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Finance Tracker' })).toBeVisible();
  await expect(page.getByTestId('health-status')).toHaveText('ok');
});

test('client-side routes fall back to the app', async ({ page }) => {
  await page.goto('/some/client/route');
  await expect(page.getByRole('heading', { name: 'Finance Tracker' })).toBeVisible();
});
