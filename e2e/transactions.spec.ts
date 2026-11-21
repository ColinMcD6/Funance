import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = resolve(import.meta.dirname, '../fixtures/csv/tangerine-chequing-2026-09.csv');

type Preset = { id: string; mapping: unknown };
type Owner = { id: number; name: string };
type Category = { id: number; name: string };
type TransactionList = {
  items: {
    id: number;
    ownerId: number;
    categoryId: number | null;
    categorySource: string | null;
  }[];
  total: number;
};

/**
 * Both browser projects share one database, so each imports the fixture into an account of its
 * own and the page is filtered to that account.
 */
async function importFixture(page: Page, accountName: string): Promise<number> {
  const presets = (await (await page.request.get('/api/csv-presets')).json()) as Preset[];
  const owners = (await (await page.request.get('/api/owners')).json()) as Owner[];
  const account = await page.request.post('/api/accounts', {
    data: {
      name: accountName,
      institution: 'tangerine',
      type: 'chequing',
      defaultOwnerId: owners.find((o) => o.name === 'Colin')?.id,
      csvMapping: presets.find((p) => p.id === 'tangerine-chequing')?.mapping,
    },
  });
  expect(account.status()).toBe(201);
  const accountId = ((await account.json()) as { id: number }).id;
  const preview = await page.request.post('/api/imports/preview', {
    multipart: {
      accountId: String(accountId),
      file: { name: 'september.csv', mimeType: 'text/csv', buffer: readFileSync(FIXTURE) },
    },
  });
  expect(preview.status()).toBe(201);
  const importId = ((await preview.json()) as { import: { id: number } }).import.id;
  expect((await page.request.post(`/api/imports/${importId}/commit`, { data: {} })).ok()).toBe(
    true,
  );
  return accountId;
}

test('search, sort by amount, edit an owner, bulk-categorize, reload and keep every change', async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === 'phone';
  await page.goto('/');
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  const accountId = await importFixture(page, `Transactions e2e ${testInfo.project.name}`);

  await page.goto(`/transactions?account=${accountId}`);
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
  await expect(page.getByTestId('range')).toHaveText('1–38 of 38');

  // Search for a merchant.
  await page.getByLabel('Search').fill('uber');
  await page.getByLabel('Search').press('Enter');
  await expect(page.getByTestId('range')).toHaveText('1–4 of 4');

  // Sort by amount, highest first.
  if (phone) {
    await page.getByLabel('Sort').selectOption({ label: 'Amount, highest first' });
  } else {
    await page.getByRole('button', { name: 'Amount' }).click();
  }
  await expect(page).toHaveURL(/sort=amount/);
  const rows = page.getByTestId(phone ? 'transaction-card' : 'transaction-row');
  const amounts = rows.getByTestId('amount');
  await expect(amounts).toHaveText(['-$13.62', '-$37.32', '-$54.92', '-$94.70']);

  // Change one row's owner.
  await rows.nth(0).getByRole('combobox', { name: 'Owner' }).selectOption({ label: 'Emily' });
  await expect(rows.nth(0).getByRole('combobox', { name: 'Owner' })).toHaveValue(
    String(await ownerId(page, 'Emily')),
  );

  // Bulk-categorize three rows.
  for (const index of [1, 2, 3]) {
    await rows.nth(index).getByRole('checkbox').check();
  }
  const bar = page.getByRole('region', { name: 'Bulk actions' });
  await expect(bar.getByTestId('selected-count')).toHaveText('3 selected');
  await bar
    .getByLabel('Set category of selected')
    .selectOption({ label: 'Transportation (Other)' });
  await expect(page.getByRole('status')).toHaveText('Updated 3 of 3 selected transactions.');

  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, 'horizontal overflow on the transaction list').toBeLessThanOrEqual(0);

  // Reload: the filters, the sort and every edit are kept.
  await page.reload();
  await expect(page.getByLabel('Search')).toHaveValue('uber');
  await expect(amounts).toHaveText(['-$13.62', '-$37.32', '-$54.92', '-$94.70']);
  const emily = String(await ownerId(page, 'Emily'));
  const colin = String(await ownerId(page, 'Colin'));
  const transport = String(await categoryId(page, 'Transportation (Other)'));
  const expected = [
    [emily, ''],
    [colin, transport],
    [colin, transport],
    [colin, transport],
  ];
  for (const [index, [owner, category]] of expected.entries()) {
    await expect(rows.nth(index).getByRole('combobox', { name: 'Owner' })).toHaveValue(owner ?? '');
    await expect(rows.nth(index).getByRole('combobox', { name: 'Category' })).toHaveValue(
      category ?? '',
    );
  }

  // The API agrees, and the categories were recorded as set by hand.
  const res = await page.request.get(
    `/api/transactions?account=${accountId}&q=uber&sort=amount&order=desc`,
  );
  const list = (await res.json()) as TransactionList;
  expect(list.items.map((t) => [t.ownerId, t.categoryId, t.categorySource])).toEqual([
    [Number(emily), null, null],
    [Number(colin), Number(transport), 'manual'],
    [Number(colin), Number(transport), 'manual'],
    [Number(colin), Number(transport), 'manual'],
  ]);
});

async function ownerId(page: Page, name: string): Promise<number> {
  const owners = (await (await page.request.get('/api/owners')).json()) as Owner[];
  const id = owners.find((o) => o.name === name)?.id;
  if (id === undefined) throw new Error(`no owner ${name}`);
  return id;
}

async function categoryId(page: Page, name: string): Promise<number> {
  const categories = (await (await page.request.get('/api/categories')).json()) as Category[];
  const id = categories.find((c) => c.name === name)?.id;
  if (id === undefined) throw new Error(`no category ${name}`);
  return id;
}
