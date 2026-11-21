import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const LEGACY = resolve(import.meta.dirname, '../fixtures/legacy');
const SEPTEMBER = resolve(import.meta.dirname, '../fixtures/csv/tangerine-chequing-2026-09.csv');

type Account = { id: number; name: string };

async function chooseProfile(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
}

/** Months with legacy rows (no account) that a September statement would overlap. */
async function legacyMonthsSeenByStatement(page: Page): Promise<string[]> {
  const accounts = (await (await page.request.get('/api/accounts')).json()) as Account[];
  const res = await page.request.post('/api/imports/preview', {
    multipart: {
      accountId: String(accounts.find((a) => a.name === 'Tangerine Chequing')?.id),
      file: { name: 'check.csv', mimeType: 'text/csv', buffer: readFileSync(SEPTEMBER) },
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { legacyOverlapMonths: string[] }).legacyOverlapMonths;
}

// Only one legacy import may be committed at a time and both browser projects share one
// database, so the commit journey runs in the desktop project only.
test('upload the legacy workbook in Settings, commit, find its rows with no account, undo', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'one committed legacy import at a time');
  await chooseProfile(page, 'Colin');
  await page
    .getByRole('navigation', { name: 'Main' })
    .filter({ visible: true })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('link', { name: 'Import legacy spreadsheet' }).click();
  await expect(page.getByRole('heading', { name: 'Import legacy spreadsheet' })).toBeVisible();

  await page
    .getByLabel('Workbook', { exact: true })
    .setInputFiles(resolve(LEGACY, 'legacy-valid.xlsx'));
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: 'Preview: legacy-valid.xlsx' })).toBeVisible();
  await expect(page.getByTestId('month-total')).toHaveCount(3);
  await expect(page.getByTestId('month-total').first()).toContainText('2026-07');
  await expect(page.getByTestId('violation')).toHaveCount(0);

  await page.getByRole('button', { name: 'Commit 60 transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Imported 60 transactions' })).toBeVisible();
  await expect(page.getByText('legacy-valid.xlsx · None')).toBeVisible();
  const importId = /\/import\/(\d+)$/.exec(page.url())?.[1];
  expect(importId).toBeDefined();

  // The rows are in the database with no account: a statement for September sees them.
  expect(await legacyMonthsSeenByStatement(page)).toEqual(['2026-09']);

  await page.getByRole('link', { name: 'Import history' }).click();
  const historyRow = page.getByTestId('import-row').filter({ hasText: `#${importId} ·` });
  await expect(historyRow).toContainText('None');
  await page.getByRole('button', { name: `Undo import ${importId}` }).click();
  const dialog = page.getByRole('alertdialog', { name: `Confirm undo of import ${importId}` });
  await dialog.getByRole('button', { name: 'Undo import' }).click();
  await expect(historyRow.getByText('Undone', { exact: true })).toBeVisible();
  expect(await legacyMonthsSeenByStatement(page)).toEqual([]);
});

test('a workbook breaking the format lists each problem and cannot be committed', async ({
  page,
}) => {
  await chooseProfile(page, 'Emily');
  await page.goto('/settings/legacy-import');
  await page
    .getByLabel('Workbook', { exact: true })
    .setInputFiles(resolve(LEGACY, 'legacy-invalid.xlsx'));
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(
    page.getByRole('heading', { name: '20 problems to fix in the workbook' }),
  ).toBeVisible();
  await expect(page.getByTestId('violation').first()).toContainText('Sheet Categories');
  await expect(page.getByRole('button', { name: /^Commit / })).toBeDisabled();

  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, 'horizontal overflow on the legacy preview').toBeLessThanOrEqual(0);
});
