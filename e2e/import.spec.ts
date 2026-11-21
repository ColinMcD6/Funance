import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const FIXTURE = resolve(import.meta.dirname, '../fixtures/csv/tangerine-chequing-2026-09.csv');

type Preset = { id: string; mapping: unknown };
type Owner = { id: number; name: string };
type PreviewResult = { import: { id: number }; rows: { status: string }[] };

async function chooseProfile(page: Page, name: string) {
  await page.goto('/');
  await page.getByRole('button', { name }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
}

/** Both browser projects share one database, so each imports into an account of its own. */
async function createAccount(page: Page, name: string): Promise<number> {
  const presets = (await (await page.request.get('/api/csv-presets')).json()) as Preset[];
  const owners = (await (await page.request.get('/api/owners')).json()) as Owner[];
  const res = await page.request.post('/api/accounts', {
    data: {
      name,
      institution: 'tangerine',
      type: 'chequing',
      defaultOwnerId: owners.find((o) => o.name === 'Colin')?.id,
      csvMapping: presets.find((p) => p.id === 'tangerine-chequing')?.mapping,
    },
  });
  expect(res.status()).toBe(201);
  return ((await res.json()) as { id: number }).id;
}

/**
 * Previews the fixture through the API and counts its row statuses: every row the account
 * already holds in the database comes back as a duplicate.
 */
async function statusesInDatabase(page: Page, accountId: number) {
  const res = await page.request.post('/api/imports/preview', {
    multipart: {
      accountId: String(accountId),
      file: { name: 'check.csv', mimeType: 'text/csv', buffer: readFileSync(FIXTURE) },
    },
  });
  expect(res.status()).toBe(201);
  const { rows } = (await res.json()) as PreviewResult;
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  return { new: count('new'), duplicate: count('duplicate') };
}

test('import a statement, commit, find its rows, undo, and see them gone', async ({
  page,
}, testInfo) => {
  const accountName = `Tangerine e2e ${testInfo.project.name}`;
  await chooseProfile(page, 'Colin');
  const accountId = await createAccount(page, accountName);

  await page
    .getByRole('navigation', { name: 'Main' })
    .filter({ visible: true })
    .getByRole('link', { name: 'Import' })
    .click();
  await expect(page.getByRole('heading', { name: 'Import', level: 1 })).toBeVisible();
  await page.getByLabel('Account').selectOption({ label: accountName });
  await page.getByLabel('Statement file').setInputFiles(FIXTURE);
  await page.getByRole('button', { name: 'Preview' }).click();

  await expect(page.getByRole('heading', { name: /^Preview: / })).toBeVisible();
  await expect(page.getByTestId('count-new')).toHaveText('38');
  await expect(page.getByTestId('count-duplicate')).toHaveText('0');
  await expect(page.getByTestId('count-skipped')).toHaveText('2');
  await expect(page.getByTestId('count-error')).toHaveText('0');
  await page.getByRole('button', { name: 'Skipped (2)' }).click();
  await expect(page.getByText('Zero amount').filter({ visible: true })).toHaveCount(2);

  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, 'horizontal overflow on the preview').toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Commit 38 new transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Imported 38 transactions' })).toBeVisible();
  const importId = /\/import\/(\d+)$/.exec(page.url())?.[1];
  expect(importId).toBeDefined();

  // The rows are in the database: previewing the same file again finds every one of them.
  expect(await statusesInDatabase(page, accountId)).toEqual({ new: 0, duplicate: 38 });

  await page.getByRole('link', { name: 'Import history' }).click();
  await page.getByRole('button', { name: `Undo import ${importId}` }).click();
  const dialog = page.getByRole('alertdialog', { name: `Confirm undo of import ${importId}` });
  await expect(dialog).toContainText('This deletes the 38 transactions it added.');
  await expect(dialog).toContainText('None of them were categorized by hand.');
  await dialog.getByRole('button', { name: 'Undo import' }).click();
  await expect(
    page
      .getByTestId('import-row')
      .filter({ hasText: `#${importId} ·` })
      .getByText('Undone', { exact: true }),
  ).toBeVisible();

  // Undone: the account holds none of the rows any more.
  expect(await statusesInDatabase(page, accountId)).toEqual({ new: 38, duplicate: 0 });
});

test('a file whose headers do not match the mapping shows the missing columns', async ({
  page,
}) => {
  await chooseProfile(page, 'Emily');
  await page.goto('/import');
  await page.getByLabel('Account').selectOption({ label: 'Tangerine Chequing' });
  await page
    .getByLabel('Statement file')
    .setInputFiles(resolve(import.meta.dirname, '../fixtures/csv/wrong-headers.csv'));
  await page.getByRole('button', { name: 'Preview' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('"Date", "Memo", "Amount"');
  await expect(
    alert.getByRole('link', { name: 'Edit the Tangerine Chequing mapping' }),
  ).toBeVisible();
});
