import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = resolve(import.meta.dirname, '../fixtures/csv/tangerine-mastercard-2026-10.csv');

type Preset = { id: string; mapping: unknown };
type Category = { id: number; name: string };
type TransactionList = {
  items: { description: string; categoryId: number | null; categorySource: string | null }[];
  total: number;
};

/**
 * Both browser projects share one database, so each imports the fixture into an account of its
 * own, and its rule is limited to that account so the other project's rows never change the
 * counts.
 */
async function importFixture(page: Page, accountName: string): Promise<number> {
  const presets = (await (await page.request.get('/api/csv-presets')).json()) as Preset[];
  const account = await page.request.post('/api/accounts', {
    data: {
      name: accountName,
      institution: 'tangerine',
      type: 'credit_card',
      defaultOwnerId: 1,
      csvMapping: presets.find((p) => p.id === 'tangerine-mastercard')?.mapping,
    },
  });
  expect(account.status()).toBe(201);
  const accountId = ((await account.json()) as { id: number }).id;
  const preview = await page.request.post('/api/imports/preview', {
    multipart: {
      accountId: String(accountId),
      file: { name: 'october.csv', mimeType: 'text/csv', buffer: readFileSync(FIXTURE) },
    },
  });
  expect(preview.status()).toBe(201);
  const importId = ((await preview.json()) as { import: { id: number } }).import.id;
  expect((await page.request.post(`/api/imports/${importId}/commit`, { data: {} })).ok()).toBe(
    true,
  );
  return accountId;
}

async function costcoRows(page: Page, accountId: number): Promise<TransactionList> {
  const res = await page.request.get(`/api/transactions?account=${accountId}&q=costco`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as TransactionList;
}

test('create "description contains COSTCO sets Groceries", see the preview count, apply, and see the rows categorized', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  const accountName = `Rules e2e ${testInfo.project.name}`;
  const accountId = await importFixture(page, accountName);
  const categories = (await (await page.request.get('/api/categories')).json()) as Category[];
  const groceries = categories.find((c) => c.name === 'Groceries')?.id;

  // Before: five Costco rows, none categorized.
  const before = await costcoRows(page, accountId);
  expect(before.total).toBe(5);
  expect(before.items.every((t) => t.categoryId === null)).toBe(true);

  await page.goto('/rules');
  await expect(page.getByRole('heading', { name: 'Rules', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'New rule' }).click();
  const form = page.getByRole('form', { name: 'New rule' });
  await form.getByLabel('Field').selectOption({ label: 'Description' });
  await form.getByLabel('Match').selectOption({ label: 'contains' });
  await form.getByLabel('Pattern').fill('COSTCO');
  await form.getByLabel('Only for account').selectOption({ label: accountName });
  await form.getByLabel('Set category').selectOption({ label: 'Groceries' });

  // The live preview counts the matches before anything is saved.
  await expect(form.getByTestId('rule-match-count')).toHaveText('Matches 5 transactions');
  await expect(form.getByTestId('rule-sample')).toHaveCount(5);
  await expect(form.getByTestId('rule-sample').first()).toContainText('COSTCO WHOLESALE');

  await form.getByRole('button', { name: 'Create rule' }).click();
  await expect(form).toBeHidden();
  const row = page
    .getByTestId('rule-row')
    .filter({ hasText: '“COSTCO”' })
    .filter({ hasText: `Only ${accountName}` });
  await expect(row).toContainText('Groceries');

  await page.getByRole('button', { name: 'Apply rules now' }).click();
  await expect(page.getByTestId('apply-result')).toHaveText(/Rules changed \d+ transactions?\./);

  // After: every Costco row has Groceries, set by the rule.
  const after = await costcoRows(page, accountId);
  expect(after.items.map((t) => [t.categoryId, t.categorySource])).toEqual(
    Array.from({ length: 5 }, () => [groceries, 'rule']),
  );

  // And the Transactions page shows them under Groceries.
  await page.goto(`/transactions?account=${accountId}&category=${groceries}`);
  await expect(page.getByTestId('range')).toHaveText('1–5 of 5');
});
