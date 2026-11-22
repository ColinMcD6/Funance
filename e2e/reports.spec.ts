import { expect, test, type Page } from '@playwright/test';

type Owner = { id: number; name: string };
type Category = { id: number; name: string };
type Account = { id: number; name: string };
type TransactionList = { items: { id: number; description: string }[]; total: number };

/**
 * A hand-written month for the monthly review. All tests share one database, so each test and
 * browser project uses its own year, which no other spec touches, and its own account. Expected totals for March:
 *
 * | Owner | Income    | Spending                | Left over | Uncategorized |
 * | Colin | $3,000.00 | $100.00                 | $2,900.00 | 0             |
 * | Emily | $2,000.00 | $60.00                  | $1,940.00 | 1 ($12.34)    |
 * | Joint | $0.00     | $65.00 (40 + 25)        | -$65.00   | 0             |
 * | All   | $5,000.00 | $225.00                 | $4,775.00 | 1             |
 */
function statement(year: number): string {
  const rows: [string, string, string, string][] = [
    [`03/02/${year}`, 'E2E GROCER A', '-100.00', 'Colin'],
    [`03/03/${year}`, 'E2E GROCER B', '-60.00', 'Emily'],
    [`03/04/${year}`, 'E2E GROCER C', '-40.00', 'Joint'],
    [`03/05/${year}`, 'E2E PAY C', '3000.00', 'Colin'],
    [`03/06/${year}`, 'E2E PAY E', '2000.00', 'Emily'],
    [`03/07/${year}`, 'E2E DINER', '-25.00', 'Joint'],
    [`03/08/${year}`, 'E2E MYSTERY', '-12.34', 'Emily'],
    [`02/10/${year}`, 'E2E GROCER FEB', '-80.00', 'Colin'],
  ];
  return ['Date,Description,Amount,Owner', ...rows.map((r) => r.join(','))].join('\n') + '\n';
}

const CATEGORY_OF: Record<string, string> = {
  'E2E GROCER A': 'Groceries',
  'E2E GROCER B': 'Groceries',
  'E2E GROCER C': 'Groceries',
  'E2E GROCER FEB': 'Groceries',
  'E2E PAY C': 'Income',
  'E2E PAY E': 'Income',
  'E2E DINER': 'Eating out',
};

/** Imports the statement into the project's own account and categorizes it. Safe to repeat. */
async function seedMonth(page: Page, accountName: string, year: number): Promise<void> {
  const owners = (await (await page.request.get('/api/owners')).json()) as Owner[];
  const ownerId = (name: string) => {
    const owner = owners.find((o) => o.name === name);
    if (owner === undefined) throw new Error(`no owner ${name}`);
    return owner.id;
  };
  const created = await page.request.post('/api/accounts', {
    data: {
      name: accountName,
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
  let accountId: number;
  if (created.status() === 201) {
    accountId = ((await created.json()) as Account).id;
  } else {
    // A retry: the account is already there.
    const accounts = (await (await page.request.get('/api/accounts')).json()) as Account[];
    const found = accounts.find((a) => a.name === accountName);
    if (found === undefined) throw new Error(`could not create ${accountName}`);
    accountId = found.id;
  }

  const preview = await page.request.post('/api/imports/preview', {
    multipart: {
      accountId: String(accountId),
      file: { name: 'march.csv', mimeType: 'text/csv', buffer: Buffer.from(statement(year)) },
    },
  });
  expect(preview.status()).toBe(201);
  const importId = ((await preview.json()) as { import: { id: number } }).import.id;
  expect((await page.request.post(`/api/imports/${importId}/commit`, { data: {} })).ok()).toBe(
    true,
  );

  const categories = (await (await page.request.get('/api/categories')).json()) as Category[];
  const list = (await (
    await page.request.get(`/api/transactions?account=${accountId}&pageSize=500`)
  ).json()) as TransactionList;
  expect(list.total).toBe(8);
  for (const name of new Set(Object.values(CATEGORY_OF))) {
    const categoryId = categories.find((c) => c.name === name)?.id;
    const ids = list.items.filter((t) => CATEGORY_OF[t.description] === name).map((t) => t.id);
    const res = await page.request.post('/api/transactions/bulk', {
      data: { ids, patch: { categoryId } },
    });
    expect(res.ok()).toBe(true);
  }
}

async function expectTotals(
  page: Page,
  totals: { income: string; spending: string; leftOver: string },
): Promise<void> {
  await expect(page.getByTestId('total-income')).toHaveText(totals.income);
  await expect(page.getByTestId('total-spending')).toHaveText(totals.spending);
  await expect(page.getByTestId('total-saved')).toHaveText('$0.00');
  await expect(page.getByTestId('total-left-over')).toHaveText(totals.leftOver);
}

/** Nothing on the page is wider than the viewport: no horizontal scrolling. */
async function expectNoOverflow(page: Page): Promise<void> {
  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);
}

async function expectChartFits(page: Page, testId: string): Promise<void> {
  const chart = page.getByTestId(testId).locator('svg.recharts-surface').first();
  await expect(chart).toBeVisible();
  const box = await chart.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box !== null && viewport !== null) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
  }
}

test('monthly review: switch owner, see the totals change, drill into a category', async ({
  page,
}, testInfo) => {
  const phone = testInfo.project.name === 'phone';
  const year = phone ? 2018 : 2019;
  await page.goto('/');
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  await seedMonth(page, `Reports e2e ${testInfo.project.name}`, year);

  // The dashboard opens on the active profile.
  await page.goto(`/?month=${year}-03`);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Colin' })).toHaveAttribute('aria-pressed', 'true');
  await expectTotals(page, { income: '$3,000.00', spending: '$100.00', leftOver: '$2,900.00' });
  await expect(page.getByTestId('uncategorized-warning')).toHaveCount(0);

  await page.getByRole('button', { name: 'Emily' }).click();
  await expectTotals(page, { income: '$2,000.00', spending: '$60.00', leftOver: '$1,940.00' });
  await expect(page.getByTestId('uncategorized-warning')).toContainText(
    '1 uncategorized transaction ($12.34)',
  );

  await page.getByRole('button', { name: 'Joint' }).click();
  await expectTotals(page, { income: '$0.00', spending: '$65.00', leftOver: '-$65.00' });

  await page.getByRole('button', { name: 'All' }).click();
  await expectTotals(page, { income: '$5,000.00', spending: '$225.00', leftOver: '$4,775.00' });

  // The comparison table: March against February.
  const groceries = page.getByTestId('compare-row').filter({ hasText: 'Groceries' });
  await expect(groceries).toContainText('$200.00');
  await expect(groceries).toContainText('$80.00');
  await expect(groceries).toContainText('+$120.00');

  await expectChartFits(page, 'breakdown-chart');
  await expectNoOverflow(page);

  // Click a category: Transactions filtered to it, the month and the owner.
  await groceries.getByRole('link', { name: 'Groceries' }).click();
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
  const url = new URL(page.url());
  expect(url.pathname).toBe('/transactions');
  expect(url.searchParams.get('from')).toBe(`${year}-03-01`);
  expect(url.searchParams.get('to')).toBe(`${year}-03-31`);
  expect(url.searchParams.get('owner')).toBeNull();
  await expect(page.getByTestId('range')).toHaveText('1–3 of 3');
  const rows = page.getByTestId(phone ? 'transaction-card' : 'transaction-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.filter({ hasText: 'E2E GROCER' })).toHaveCount(3);

  // Back on the dashboard with one owner, a click on the chart's largest bar drills in too.
  await page.goto(`/?month=${year}-03&owner=all`);
  await page.getByRole('button', { name: 'Emily' }).click();
  await expectTotals(page, { income: '$2,000.00', spending: '$60.00', leftOver: '$1,940.00' });
  await page.getByTestId('breakdown-chart').locator('.recharts-bar-rectangle').first().click();
  await expect(page).toHaveURL(/\/transactions\?/);
  const drilled = new URL(page.url()).searchParams;
  expect(drilled.get('owner')).not.toBeNull();
  expect(drilled.get('from')).toBe(`${year}-03-01`);
  await expect(page.getByTestId('range')).toHaveText('1–1 of 1');
  await expect(rows.filter({ hasText: 'E2E GROCER B' })).toHaveCount(1);
});

test('trends: charts render and fit the screen', async ({ page }, testInfo) => {
  const phone = testInfo.project.name === 'phone';
  const year = phone ? 2016 : 2017;
  await page.goto('/');
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  await seedMonth(page, `Trends e2e ${testInfo.project.name}`, year);

  await page.goto(`/trends?month=${year}-03&owner=all`);
  await expect(page.getByRole('heading', { name: 'Trends', level: 1 })).toBeVisible();
  await expectChartFits(page, 'trend-stack-chart');
  await expectChartFits(page, 'trend-line-chart');
  await expect(page.getByRole('checkbox', { name: 'Groceries' })).toBeChecked();
  await expectNoOverflow(page);
});
