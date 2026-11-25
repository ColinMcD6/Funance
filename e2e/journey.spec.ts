import { expect, test, type Page } from '@playwright/test';
import { openFromNav, showTransactionFilters } from './nav';

type Owner = { id: number; name: string };

/**
 * The whole monthly session in one test, at desktop and phone width: choose a profile, import
 * a statement, clear its rows from the Uncategorized queue (one pick becomes a rule), check the
 * account has nothing uncategorized left, review the month on the dashboard with the owner
 * switch, drill into a category, and back up. All specs share one database, so each browser
 * project uses its own account and a year no other spec touches.
 *
 * Expected totals for March, worked out by hand:
 *
 * | Owner | Income    | Spending                   | Saved   | Left over                      |
 * | Colin | $2,500.00 | $120.00                    | $300.00 | $2,080.00                      |
 * | All   | $2,500.00 | $215.50 (120 + 15.50 + 80) | $300.00 | $1,984.50 (2500 − 215.50 − 300) |
 *
 * The card payment is a transfer (set by the seeded rule) and counts nowhere.
 */
const ROWS: {
  date: string;
  description: string;
  amount: string;
  owner: string;
  category: string;
}[] = [
  {
    date: '03/02',
    description: 'JOURNEY GROCER',
    amount: '-120.00',
    owner: 'Colin',
    category: 'Groceries',
  },
  {
    date: '03/05',
    description: 'JOURNEY PAYROLL',
    amount: '2500.00',
    owner: 'Colin',
    category: 'Income',
  },
  {
    date: '03/09',
    description: 'JOURNEY CAFE',
    amount: '-15.50',
    owner: 'Emily',
    category: 'Coffee',
  },
  {
    date: '03/12',
    description: 'PAYMENT - THANK YOU',
    amount: '400.00',
    owner: 'Joint',
    category: 'Card Payment',
  },
  {
    date: '03/20',
    description: 'JOURNEY HYDRO',
    amount: '-80.00',
    owner: 'Joint',
    category: 'Home',
  },
  {
    date: '03/25',
    description: 'JOURNEY TFSA',
    amount: '-300.00',
    owner: 'Colin',
    category: 'Investing',
  },
];

/**
 * The rows for one browser project. Both projects run at once against one queue, which groups
 * rows by merchant, so each project's merchants get a letter of their own ("JOURNEY CAFE P").
 */
function rowsFor(tag: string): typeof ROWS {
  return ROWS.map((r) =>
    r.category === 'Card Payment' ? r : { ...r, description: `${r.description} ${tag}` },
  );
}

function statement(rows: typeof ROWS, year: number): string {
  const lines = rows.map(
    (r) => `${r.date}/${String(year)},${r.description},${r.amount},${r.owner}`,
  );
  return ['Date,Description,Amount,Owner', ...lines].join('\n') + '\n';
}

/** Account setup is a one-time task, not part of the monthly session, so it goes through the API. */
async function createAccount(page: Page, name: string): Promise<void> {
  const owners = (await (await page.request.get('/api/owners')).json()) as Owner[];
  const ownerId = (ownerName: string) => {
    const owner = owners.find((o) => o.name === ownerName);
    if (owner === undefined) throw new Error(`no owner ${ownerName}`);
    return owner.id;
  };
  const res = await page.request.post('/api/accounts', {
    data: {
      name,
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
        ownerHintMap: { Colin: ownerId('Colin'), Emily: ownerId('Emily'), Joint: ownerId('Joint') },
      },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
}

async function expectNoOverflow(page: Page, where: string): Promise<void> {
  // A string expression: the e2e tsconfig has no DOM types.
  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, `horizontal overflow on ${where}`).toBeLessThanOrEqual(0);
}

async function expectTotals(
  page: Page,
  totals: { income: string; spending: string; saved: string; leftOver: string },
): Promise<void> {
  await expect(page.getByTestId('total-income')).toHaveText(totals.income);
  await expect(page.getByTestId('total-spending')).toHaveText(totals.spending);
  await expect(page.getByTestId('total-saved')).toHaveText(totals.saved);
  await expect(page.getByTestId('total-left-over')).toHaveText(totals.leftOver);
}

test('full monthly session: import, categorize, review, back up', async ({ page }, testInfo) => {
  const phone = testInfo.project.name === 'phone';
  // Years no other spec uses (reports: 2016 to 2019, budgets: 2015).
  const year = phone ? 2012 : 2013;
  const accountName = `Journey e2e ${testInfo.project.name}`;
  const rows = rowsFor(phone ? 'P' : 'D');
  const cafe = rows.find((r) => r.category === 'Coffee')?.description ?? '';

  // 1. Choose a profile.
  await page.goto('/');
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();
  await createAccount(page, accountName);

  // 2. Import the statement.
  await openFromNav(page, 'Import');
  await expect(page.getByRole('heading', { name: 'Import', level: 1 })).toBeVisible();
  await page.getByLabel('Account').selectOption({ label: accountName });
  await page.getByLabel('Statement file').setInputFiles({
    name: `journey-${String(year)}-03.csv`,
    mimeType: 'text/csv',
    buffer: Buffer.from(statement(rows, year)),
  });
  await page.getByRole('button', { name: 'Preview' }).click();
  await expect(page.getByRole('heading', { name: /^Preview: / })).toBeVisible();
  await expect(page.getByTestId('count-new')).toHaveText('6');
  await expect(page.getByTestId('count-duplicate')).toHaveText('0');
  await expectNoOverflow(page, 'the preview');
  await page.getByRole('button', { name: 'Commit 6 new transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Imported 6 transactions' })).toBeVisible();

  // 3. Clear this statement's rows from the Uncategorized queue. The queue also holds other
  // specs' rows (the database is shared), so each row is found by its description. The card
  // payment never reaches the queue: the seeded rule categorized it at commit.
  await page.getByRole('link', { name: 'Categorize new transactions' }).click();
  await expect(page.getByRole('heading', { name: 'Uncategorized', level: 1 })).toBeVisible();
  const queue = page.getByTestId('queue-row');
  const prompt = page.getByRole('region', { name: 'Create a rule' });
  for (const row of rows) {
    const inQueue = queue.filter({ hasText: row.description });
    if (row.category === 'Card Payment') {
      await expect(inQueue).toHaveCount(0);
      continue;
    }
    await expect(inQueue).toHaveCount(1);
    await inQueue
      .getByRole('combobox', { name: 'Category', exact: true })
      .selectOption({ label: row.category });
    // A manual pick offers a rule for the merchant: create one for the utility bill, which
    // comes every month, and decline the rest.
    await expect(prompt.getByTestId('rule-question')).toContainText(`as ${row.category}?`);
    if (row.category === 'Home') {
      await prompt.getByRole('button', { name: 'Create rule' }).click();
      await expect(page.getByTestId('queue-message')).toContainText('Created the rule');
    } else {
      await prompt.getByRole('button', { name: 'Not now' }).click();
    }
    await expect(prompt).toBeHidden();
    await expect(inQueue).toHaveCount(0);
  }
  await expectNoOverflow(page, 'the Uncategorized queue');

  // Nothing is left uncategorized in the account.
  await openFromNav(page, 'Transactions');
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
  await showTransactionFilters(page);
  const filters = page.getByRole('region', { name: 'Filters' });
  await filters.getByLabel('Account', { exact: true }).selectOption({ label: accountName });
  await expect(page.getByTestId('range')).toHaveText('1–6 of 6');
  await expectNoOverflow(page, 'the transaction list');
  await filters.getByLabel('Category', { exact: true }).selectOption({ label: 'Uncategorized' });
  await expect(page.getByText('No transactions match these filters.')).toBeVisible();

  // 4. Review the month: the dashboard opens on the active profile.
  await openFromNav(page, 'Dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await page.goto(`/?month=${String(year)}-03`);
  await expect(page.getByRole('button', { name: 'Colin' })).toHaveAttribute('aria-pressed', 'true');
  await expectTotals(page, {
    income: '$2,500.00',
    spending: '$120.00',
    saved: '$300.00',
    leftOver: '$2,080.00',
  });
  await page.getByRole('button', { name: 'All' }).click();
  await expectTotals(page, {
    income: '$2,500.00',
    spending: '$215.50',
    saved: '$300.00',
    leftOver: '$1,984.50',
  });
  await expect(page.getByTestId('uncategorized-warning')).toHaveCount(0);
  await expectNoOverflow(page, 'the dashboard');

  // Drill into a category.
  await page
    .getByTestId('compare-row')
    .filter({ hasText: 'Coffee' })
    .getByRole('link', { name: 'Coffee' })
    .click();
  await expect(page.getByRole('heading', { name: 'Transactions', level: 1 })).toBeVisible();
  await expect(page.getByTestId('range')).toHaveText('1–1 of 1');
  const listed = page.getByTestId(phone ? 'transaction-card' : 'transaction-row');
  await expect(listed.filter({ hasText: cafe })).toHaveCount(1);

  // 5. Back up and download the backup.
  await openFromNav(page, 'Settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Back up now' }).click();
  await expect(page.getByRole('status')).toHaveText(/^Saved finance-\d{8}-\d{6}\.sqlite \(/);
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download latest backup' }).click();
  expect((await download).suggestedFilename()).toMatch(/^finance-\d{8}-\d{6}\.sqlite$/);
  await expectNoOverflow(page, 'Settings');
});
