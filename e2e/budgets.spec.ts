import { expect, test, type Page } from '@playwright/test';

type Owner = { id: number; name: string };
type Category = { id: number; name: string };
type Account = { id: number; name: string };
type Budget = {
  id: number;
  categoryId: number;
  ownerId: number | null;
  monthlyAmountCents: number;
  effectiveFrom: string;
};
type TransactionList = { items: { id: number }[]; total: number };

const YEAR = 2015;
const CATEGORY = 'E2E Budgeted';
const ACCOUNT = 'Budgets e2e';

/**
 * March 2015 in the spec's own category, which no other spec uses:
 *
 * | Owner | Spent   | Budget in effect                     | Indicator              |
 * | Colin | $120.00 | his own, $100.00                     | +$20.00 over           |
 * | Emily | $30.00  | her own, $50.00                      | -$20.00 under          |
 * | Joint | $10.00  | none (then $15.00, added in the UI)  | none (then -$5.00 under) |
 * | All   | $160.00 | household from 2014-03, $150.00      | +$10.00 over           |
 *
 * The household also has a 2014-01 row ($500, replaced by 2014-03) and a 2015-04 row ($1, not
 * started yet), so March uses the latest row at or before it.
 */
function statement(): string {
  const rows = [
    `03/02/${YEAR},E2E BUDGET COLIN,-120.00,Colin`,
    `03/03/${YEAR},E2E BUDGET EMILY,-30.00,Emily`,
    `03/04/${YEAR},E2E BUDGET JOINT,-10.00,Joint`,
  ];
  return ['Date,Description,Amount,Owner', ...rows].join('\n') + '\n';
}

async function seed(page: Page): Promise<void> {
  const owners = (await (await page.request.get('/api/owners')).json()) as Owner[];
  const ownerId = (name: string) => {
    const owner = owners.find((o) => o.name === name);
    if (owner === undefined) throw new Error(`no owner ${name}`);
    return owner.id;
  };

  // The category and account are created once; a retry finds them.
  await page.request.post('/api/categories', {
    data: { name: CATEGORY, kind: 'expense', color: '#0ea5e9', groupName: 'E2E' },
  });
  const categories = (await (await page.request.get('/api/categories')).json()) as Category[];
  const categoryId = categories.find((c) => c.name === CATEGORY)?.id;
  if (categoryId === undefined) throw new Error(`could not create ${CATEGORY}`);

  await page.request.post('/api/accounts', {
    data: {
      name: ACCOUNT,
      institution: 'other',
      type: 'chequing',
      defaultOwnerId: ownerId('Joint'),
      csvMapping: {
        encoding: 'utf-8',
        hasHeader: true,
        columns: {
          date: 'Date',
          description: ['Description'],
          amount: 'Amount',
          ownerHint: 'Owner',
        },
        dateFormat: 'MM/dd/yyyy',
        amountSign: 'negative_is_outflow',
        skipZeroAmount: true,
        ownerHintMap: {
          Colin: ownerId('Colin'),
          Emily: ownerId('Emily'),
          Joint: ownerId('Joint'),
        },
      },
    },
  });
  const accounts = (await (await page.request.get('/api/accounts')).json()) as Account[];
  const accountId = accounts.find((a) => a.name === ACCOUNT)?.id;
  if (accountId === undefined) throw new Error(`could not create ${ACCOUNT}`);

  const preview = await page.request.post('/api/imports/preview', {
    multipart: {
      accountId: String(accountId),
      file: { name: 'budgets.csv', mimeType: 'text/csv', buffer: Buffer.from(statement()) },
    },
  });
  expect(preview.status()).toBe(201);
  const importId = ((await preview.json()) as { import: { id: number } }).import.id;
  expect((await page.request.post(`/api/imports/${importId}/commit`, { data: {} })).ok()).toBe(
    true,
  );
  const list = (await (
    await page.request.get(`/api/transactions?account=${accountId}&pageSize=500`)
  ).json()) as TransactionList;
  expect(list.total).toBe(3);
  const bulk = await page.request.post('/api/transactions/bulk', {
    data: { ids: list.items.map((t) => t.id), patch: { categoryId } },
  });
  expect(bulk.ok()).toBe(true);

  // PUT replaces every budget: keep other categories' rows, reset this category's.
  const current = (await (await page.request.get('/api/budgets')).json()) as Budget[];
  const others = current
    .filter((b) => b.categoryId !== categoryId)
    .map((b) => ({
      categoryId: b.categoryId,
      ownerId: b.ownerId,
      monthlyAmountCents: b.monthlyAmountCents,
      effectiveFrom: b.effectiveFrom,
    }));
  const mine = [
    { ownerId: null, monthlyAmountCents: 50000, effectiveFrom: '2014-01' },
    { ownerId: null, monthlyAmountCents: 15000, effectiveFrom: '2014-03' },
    { ownerId: null, monthlyAmountCents: 100, effectiveFrom: '2015-04' },
    { ownerId: ownerId('Colin'), monthlyAmountCents: 10000, effectiveFrom: '2014-01' },
    { ownerId: ownerId('Emily'), monthlyAmountCents: 5000, effectiveFrom: '2014-01' },
  ].map((b) => ({ categoryId, ...b }));
  const put = await page.request.put('/api/budgets', { data: { budgets: [...others, ...mine] } });
  expect(put.ok()).toBe(true);
}

function budgetRow(page: Page) {
  return page.getByTestId('compare-row').filter({ hasText: CATEGORY });
}

async function expectIndicator(page: Page, text: string | null): Promise<void> {
  const indicator = budgetRow(page).getByTestId('budget-indicator');
  if (text === null) await expect(indicator).toHaveCount(0);
  else await expect(indicator).toContainText(text);
}

async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
}

// PUT /budgets replaces every row and all specs share one database, so two browser projects
// editing budgets at once could undo each other's saves. The spec runs once, in the desktop
// project, and checks the phone width itself by resizing the viewport.
test('budgets: indicators show the sign and amount for each owner; a budget added in Settings', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'runs once; checks the phone width itself');
  await page.goto('/');
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  await seed(page);

  await page.goto(`/?month=${String(YEAR)}-03&owner=all`);
  await expect(budgetRow(page)).toContainText('$160.00');
  await expectIndicator(page, '+$10.00 over of $150.00');

  await page.getByRole('button', { name: 'Colin' }).click();
  await expectIndicator(page, '+$20.00 over of $100.00');
  await page.getByRole('button', { name: 'Emily' }).click();
  await expectIndicator(page, '-$20.00 under of $50.00');
  await page.getByRole('button', { name: 'Joint' }).click();
  await expect(budgetRow(page)).toContainText('$10.00');
  await expectIndicator(page, null);

  // Add a Joint budget from March in Settings → Budgets.
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Edit budgets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Budgets', level: 1 })).toBeVisible();
  const rows = page.getByTestId('budget-row');
  // The five rows the seed wrote; no other spec sets budgets.
  await expect(rows).toHaveCount(5);
  await page.getByRole('button', { name: 'Add budget' }).click();
  await expect(rows).toHaveCount(6);
  const added = rows.last();
  await added.getByRole('combobox', { name: 'Category' }).selectOption({ label: CATEGORY });
  await added.getByRole('combobox', { name: 'For' }).selectOption({ label: 'Joint' });
  await added.getByLabel('From').fill(`${String(YEAR)}-03`);
  await added.getByRole('textbox', { name: 'Monthly amount' }).fill('15');
  await page.getByRole('button', { name: 'Save budgets' }).click();
  await expect(page.getByRole('status')).toHaveText('Budgets saved.');

  await page.goto(`/?month=${String(YEAR)}-03&owner=all`);
  await page.getByRole('button', { name: 'Joint' }).click();
  await expectIndicator(page, '-$5.00 under of $15.00');
  // April: the household's $1 row starts, and nothing was spent.
  await page.getByRole('button', { name: 'All' }).click();
  await page.getByRole('button', { name: 'Next month' }).click();
  await expectIndicator(page, '-$1.00 under of $1.00');

  // At phone width the indicator sits under the category name and nothing overflows.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?month=${String(YEAR)}-03&owner=all`);
  await expect(budgetRow(page).getByTestId('budget-indicator')).toBeVisible();
  await expectIndicator(page, '+$10.00 over');
  await expectNoOverflow(page);
  await page.goto('/settings/budgets');
  await expect(page.getByTestId('budget-row').first()).toBeVisible();
  await expectNoOverflow(page);
});
