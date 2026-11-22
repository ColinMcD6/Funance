import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

const ROOT = resolve(import.meta.dirname, '..');
const FIXTURE = join(ROOT, 'fixtures/csv/tangerine-mastercard-2026-10.csv');

type Account = { id: number; name: string };
type Category = { id: number; name: string };
type Item = {
  id: number;
  description: string;
  categoryId: number | null;
  categorySource: string | null;
};
type TransactionList = { items: Item[]; total: number };

// The queue and its badge count every uncategorized row in the database, and the other specs
// share one database and leave uncategorized rows behind (some on purpose). To clear "the whole
// queue", each browser project runs this spec against a server of its own, started from the
// same build (`pnpm build`) on a fresh database.
let server: ChildProcess | undefined;
let dataDir = '';
let base = '';

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once('error', fail);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      probe.close(() => {
        done(port);
      });
    });
  });
}

test.beforeAll(async () => {
  const port = await freePort();
  dataDir = mkdtempSync(join(tmpdir(), 'funance-e2e-queue-'));
  base = `http://127.0.0.1:${String(port)}`;
  server = spawn(process.execPath, [join(ROOT, 'apps/server/dist/index.js')], {
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      DATABASE_PATH: join(dataDir, 'queue.sqlite'),
    },
    stdio: 'ignore',
  });
  await expect
    .poll(
      async () => {
        try {
          return (await fetch(`${base}/api/health`)).status;
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);
});

test.afterAll(async () => {
  const child = server;
  if (child !== undefined && child.exitCode === null) {
    await new Promise<void>((done) => {
      child.once('exit', () => {
        done();
      });
      child.kill();
    });
  }
  rmSync(dataDir, { recursive: true, force: true });
});

async function getJson<T>(request: APIRequestContext, path: string): Promise<T> {
  const res = await request.get(`${base}${path}`);
  expect(res.ok()).toBe(true);
  return (await res.json()) as T;
}

/** Imports the October Tangerine Mastercard fixture into the seeded account; 40 rows. */
async function importFixture(page: Page): Promise<number> {
  const accounts = await getJson<Account[]>(page.request, '/api/accounts');
  const accountId = accounts.find((a) => a.name === 'Tangerine Mastercard')?.id;
  if (accountId === undefined) throw new Error('No seeded Tangerine Mastercard account');
  const preview = await page.request.post(`${base}/api/imports/preview`, {
    multipart: {
      accountId: String(accountId),
      file: { name: 'october.csv', mimeType: 'text/csv', buffer: readFileSync(FIXTURE) },
    },
  });
  expect(preview.status()).toBe(201);
  const importId = ((await preview.json()) as { import: { id: number } }).import.id;
  const commit = await page.request.post(`${base}/api/imports/${String(importId)}/commit`, {
    data: {},
  });
  expect(commit.ok()).toBe(true);
  return accountId;
}

/**
 * History for the suggestions: one row of eight merchants categorized by hand, as if done in an
 * earlier month. Canadian Tire and Trailhead get none, and their bank category ("Other") has no
 * categorized rows either, so they have no suggestion.
 */
const HISTORY: [string, string][] = [
  ['SAFEWAY', 'Groceries'],
  ['COSTCO', 'Groceries'],
  ['CINEPLEX', 'Entertainment'],
  ['GREEN BEAN', 'Coffee'],
  ['LAKESIDE', 'Eating out'],
  ['UBER', 'Transportation (Other)'],
  ['PETRO-CANADA', 'Gas'],
  ['TRANSIT', 'Transportation (Other)'],
];

async function categorizeHistory(page: Page, accountId: number) {
  const categories = await getJson<Category[]>(page.request, '/api/categories');
  const { items } = await getJson<TransactionList>(
    page.request,
    `/api/transactions?account=${String(accountId)}&pageSize=500`,
  );
  for (const [merchant, name] of HISTORY) {
    const row = items.find((t) => t.description.includes(merchant));
    const categoryId = categories.find((c) => c.name === name)?.id;
    if (row === undefined || categoryId === undefined) throw new Error(`No ${merchant}/${name}`);
    const res = await page.request.patch(`${base}/api/transactions/${String(row.id)}`, {
      data: { categoryId },
    });
    expect(res.ok()).toBe(true);
  }
}

test('clear the queue with suggestions, one manual pick and one created rule; the badge reaches zero', async ({
  page,
}) => {
  await page.goto(`${base}/`);
  await page.getByRole('button', { name: 'Colin' }).click();
  await expect(page.getByRole('combobox', { name: 'Active profile' })).toBeVisible();

  const accountId = await importFixture(page);
  await categorizeHistory(page, accountId);
  // 40 rows: the card payment went to Card Payment by a seeded rule, 8 are history, 31 wait.
  await page.reload();
  const badge = page.getByTestId('uncategorized-badge').filter({ visible: true });
  await expect(badge).toHaveText('31');

  const nav = page.getByRole('navigation', { name: 'Main' }).filter({ visible: true });
  await nav.getByRole('link', { name: 'Uncategorized' }).click();
  await expect(page.getByRole('heading', { name: 'Uncategorized', level: 1 })).toBeVisible();
  await expect(page.getByTestId('queue-count')).toHaveText('31 to categorize');
  const rows = page.getByTestId('queue-row');
  await expect(rows).toHaveCount(31);
  // Fits the screen: no horizontal scroll, at desktop width and at 390 px.
  const overflow = Number(
    await page.evaluate(
      'document.documentElement.scrollWidth - document.documentElement.clientWidth',
    ),
  );
  expect(overflow, 'horizontal overflow').toBeLessThanOrEqual(0);

  // Suggestions come from the merchant's history.
  const safeway = page.getByRole('region', { name: /^SAFEWAY/ });
  await expect(safeway.getByTestId('queue-row')).toHaveCount(8);
  await expect(safeway.getByRole('button', { name: 'Accept Groceries for all 8' })).toBeVisible();
  const tire = page.getByRole('region', { name: /^CANADIAN TIRE/ });
  await expect(tire.getByTestId('no-suggestion')).toHaveCount(4);

  // One manual pick, with no rule.
  const trailhead = page.getByRole('region', { name: /^TRAILHEAD/ });
  await trailhead
    .getByRole('combobox', { name: 'Category', exact: true })
    .selectOption({ label: 'Clothing' });
  const prompt = page.getByRole('region', { name: 'Create a rule' });
  await expect(prompt.getByTestId('rule-question')).toHaveText(
    'Always categorize TRAILHEAD OUTFITTERS LONDON as Clothing?',
  );
  await prompt.getByRole('button', { name: 'Not now' }).click();
  await expect(prompt).toBeHidden();
  await expect(rows).toHaveCount(30);

  // A manual pick that becomes a rule and categorizes the merchant's other rows.
  await tire
    .getByRole('combobox', { name: 'Category', exact: true })
    .first()
    .selectOption({ label: 'Home' });
  await expect(prompt.getByTestId('rule-question')).toHaveText(
    'Always categorize CANADIAN TIRE as Home?',
  );
  await expect(prompt.getByTestId('rule-prompt-matches')).toContainText('Matches 4 transactions');
  await prompt.getByRole('button', { name: 'Create rule' }).click();
  await expect(page.getByTestId('queue-message')).toHaveText(
    'Created the rule “CANADIAN TIRE” → Home. It categorized 3 more transactions.',
  );
  await expect(tire).toBeHidden();
  await expect(rows).toHaveCount(26);
  await expect(badge).toHaveText('26');

  // The keyboard: G accepts the suggestion for the first row's whole merchant.
  const firstGroupSize = await page
    .getByTestId('merchant-group')
    .first()
    .getByTestId('queue-row')
    .count();
  await page.keyboard.press('g');
  await expect(rows).toHaveCount(26 - firstGroupSize);

  // Everything left has a suggestion: accept each group, then each single row.
  for (let left = await rows.count(); left > 0; left = await rows.count()) {
    await page
      .getByRole('button', { name: /^Accept / })
      .first()
      .click();
    await expect(rows).not.toHaveCount(left);
  }

  await expect(page.getByTestId('queue-empty')).toBeVisible();
  await expect(page.getByTestId('queue-count')).toHaveText('0 to categorize');
  await expect(badge).toHaveCount(0);

  // Through the API: nothing uncategorized, and each category recorded with its source.
  const left = await getJson<TransactionList>(page.request, '/api/transactions?category=none');
  expect(left.total).toBe(0);
  const all = await getJson<TransactionList>(
    page.request,
    `/api/transactions?account=${String(accountId)}&pageSize=500`,
  );
  const sources = new Map<string | null, number>();
  for (const t of all.items)
    sources.set(t.categorySource, (sources.get(t.categorySource) ?? 0) + 1);
  expect(Object.fromEntries(sources)).toEqual({
    manual: 10, // 8 history rows, Trailhead, the first Canadian Tire
    rule: 4, // the card payment and 3 Canadian Tire rows
    suggestion: 26,
  });

  // A reload keeps it all.
  await page.reload();
  await expect(page.getByTestId('queue-empty')).toBeVisible();
  await expect(badge).toHaveCount(0);
});
