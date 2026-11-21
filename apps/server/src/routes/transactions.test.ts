import {
  apiErrorSchema,
  categoryListResponseSchema,
  changedCountResponseSchema,
  transactionListResponseSchema,
  updateTransactionResponseSchema,
  type Transaction,
} from '@funance/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock.js';
import { seedDemo } from '../db/demo-seed.js';
import type { Db } from '../db/migrate.js';
import { categories, imports, transactions } from '../db/schema.js';
import { makeTempDir } from '../db/test-db.js';
import { makeTestApp, TEST_NOW } from '../test-app.js';

const temp = makeTempDir();
afterAll(() => {
  temp.cleanup();
});

let ctx: ReturnType<typeof makeTestApp>;
beforeEach(() => {
  ctx = makeTestApp(temp.dir);
});
afterEach(() => {
  ctx.close();
});

const EARLIER = '2026-01-01T00:00:00.000Z';

type Row = {
  date: string;
  accountId: number | null;
  ownerId: number;
  category: string | null;
  amountCents: number;
  description: string;
  memo?: string;
  notes?: string;
  excluded?: boolean;
};

/**
 * Eight rows whose ids are 1 to 8 in this order. Owners 1 Colin, 2 Emily, 3 Joint; accounts are
 * the seeded ones (1 to 5); row 6 is a legacy row with no account.
 */
const ROWS: Row[] = [
  {
    date: '2026-09-01',
    accountId: 1,
    ownerId: 1,
    category: 'Groceries',
    amountCents: -5000,
    description: 'COSTCO WHOLESALE #123',
  },
  {
    date: '2026-09-05',
    accountId: 1,
    ownerId: 2,
    category: null,
    amountCents: -1250,
    description: 'Tim Hortons',
    memo: 'Coffee run',
  },
  {
    date: '2026-09-10',
    accountId: 2,
    ownerId: 3,
    category: 'Eating out',
    amountCents: -3000,
    description: 'Pizza Place',
    notes: 'Birthday dinner',
  },
  {
    date: '2026-09-10',
    accountId: 2,
    ownerId: 1,
    category: 'Income',
    amountCents: 250000,
    description: 'Payroll deposit',
  },
  {
    date: '2026-10-02',
    accountId: 3,
    ownerId: 2,
    category: null,
    amountCents: -999,
    description: 'costco gas',
    excluded: true,
  },
  {
    date: '2026-10-15',
    accountId: null,
    ownerId: 3,
    category: 'Groceries',
    amountCents: -7500,
    description: 'Superstore',
  },
  {
    date: '2026-10-20',
    accountId: 1,
    ownerId: 1,
    category: null,
    amountCents: -1250,
    description: 'Amazon Marketplace',
  },
  {
    date: '2026-11-01',
    accountId: 3,
    ownerId: 2,
    category: 'Home',
    amountCents: -20000,
    description: 'Hardware store',
  },
];

function categoryId(db: Db, name: string): number {
  const row = db.select().from(categories).where(eq(categories.name, name)).get();
  if (row === undefined) throw new Error(`no category ${name}`);
  return row.id;
}

function insertImport(db: Db, accountId: number | null): number {
  return db
    .insert(imports)
    .values({
      accountId,
      kind: accountId === null ? 'legacy' : 'csv',
      filename: 'test.csv',
      fileSha256: 'a'.repeat(64),
      rawCsv: '',
      status: 'committed',
      uploadedByOwnerId: 1,
      createdAt: EARLIER,
      committedAt: EARLIER,
    })
    .returning()
    .get().id;
}

function insertRows(db: Db): void {
  const importIds = new Map<number | null, number>();
  ROWS.forEach((row, index) => {
    let importId = importIds.get(row.accountId);
    if (importId === undefined) {
      importId = insertImport(db, row.accountId);
      importIds.set(row.accountId, importId);
    }
    db.insert(transactions)
      .values({
        accountId: row.accountId,
        importId,
        ownerId: row.ownerId,
        categoryId: row.category === null ? null : categoryId(db, row.category),
        // Row 1 was categorized by the first seeded rule, to show a manual edit replaces it.
        categorySource: row.category === null ? null : index === 0 ? 'rule' : 'manual',
        ruleId: index === 0 ? 1 : null,
        date: row.date,
        postedDate: null,
        amountCents: row.amountCents,
        description: row.description,
        memo: row.memo ?? null,
        merchantKey: row.description.toUpperCase(),
        bankCategory: null,
        externalId: null,
        dedupKey: `key-${index + 1}`,
        occurrence: 1,
        notes: row.notes ?? null,
        excluded: row.excluded ?? false,
        rawRow: {},
        createdAt: EARLIER,
        updatedAt: EARLIER,
      })
      .run();
  });
}

async function list(query = '') {
  const res = await ctx.app.request(`/api/transactions${query}`);
  expect(res.status).toBe(200);
  return transactionListResponseSchema.parse(await res.json());
}

async function ids(query = ''): Promise<number[]> {
  return (await list(query)).items.map((t) => t.id);
}

function send(method: 'PATCH' | 'POST', path: string, body: unknown) {
  return ctx.app.request(`/api/transactions${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function errorCode(res: Response): Promise<string> {
  return apiErrorSchema.parse(await res.json()).error.code;
}

function row(id: number): Transaction {
  const found = ctx.db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (found === undefined) throw new Error(`no transaction ${id}`);
  return found;
}

describe('GET /api/transactions filters', () => {
  beforeEach(() => {
    insertRows(ctx.db);
  });

  it('returns every row, newest first, with no filter', async () => {
    const result = await list();
    expect(result.total).toBe(8);
    expect(result.items.map((t) => t.id)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it.each([
    ['owner', '?owner=1', [7, 4, 1]],
    ['account id', '?account=1', [7, 2, 1]],
    ['account none (legacy rows)', '?account=none', [6]],
    ['category id', 'GROCERIES', [6, 1]],
    ['category none (uncategorized)', '?category=none', [7, 5, 2]],
    ['from (inclusive)', '?from=2026-10-02', [8, 7, 6, 5]],
    ['to (inclusive)', '?to=2026-09-10', [4, 3, 2, 1]],
    ['q in the description, any case', '?q=CoStCo', [5, 1]],
    ['q in the memo', '?q=coffee', [2]],
    ['q in the notes', '?q=BIRTHDAY', [3]],
    ['q matching nothing', '?q=nowhere', []],
    ['minCents (signed, inclusive)', '?minCents=-1250', [7, 5, 4, 2]],
    ['maxCents (signed, inclusive)', '?maxCents=-5000', [8, 6, 1]],
    ['excluded=true', '?excluded=true', [5]],
    ['excluded=false', '?excluded=false', [8, 7, 6, 4, 3, 2, 1]],
  ])('filters by %s alone', async (_name, query, expected) => {
    const resolved = query === 'GROCERIES' ? `?category=${categoryId(ctx.db, 'Groceries')}` : query;
    const result = await list(resolved);
    expect(result.items.map((t) => t.id)).toEqual(expected);
    expect(result.total).toBe(expected.length);
  });

  it('treats % and _ in the search as plain characters', async () => {
    expect(await ids('?q=%25')).toEqual([]);
    expect(await ids('?q=_')).toEqual([]);
  });

  it('combines owner and uncategorized', async () => {
    expect(await ids('?owner=2&category=none')).toEqual([5, 2]);
  });

  it('combines account, from and maxCents', async () => {
    expect(await ids('?account=1&from=2026-09-02&maxCents=-1000')).toEqual([7, 2]);
  });

  it('combines search, excluded and a date range', async () => {
    expect(await ids('?q=costco&excluded=false&from=2026-09-01&to=2026-09-30')).toEqual([1]);
  });

  it.each([
    ['owner=x'],
    ['account=abc'],
    ['category=-1'],
    ['from=2026-02-30'],
    ['to=09/01/2026'],
    ['minCents=1.5'],
    ['excluded=yes'],
    ['sort=owner'],
    ['order=up'],
    ['page=0'],
    ['pageSize=0'],
    ['pageSize=501'],
  ])('answers 400 for %s', async (query) => {
    const res = await ctx.app.request(`/api/transactions?${query}`);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });
});

describe('GET /api/transactions sorting', () => {
  beforeEach(() => {
    insertRows(ctx.db);
  });

  it.each([
    ['date', 'asc', [1, 2, 3, 4, 5, 6, 7, 8]],
    ['date', 'desc', [8, 7, 6, 5, 4, 3, 2, 1]],
    ['amount', 'asc', [8, 6, 1, 3, 2, 7, 5, 4]],
    ['amount', 'desc', [4, 5, 7, 2, 3, 1, 6, 8]],
    ['description', 'asc', [7, 5, 1, 8, 4, 3, 6, 2]],
    ['description', 'desc', [2, 6, 3, 4, 8, 1, 5, 7]],
  ])('sorts by %s %s, ties broken by id', async (sort, order, expected) => {
    expect(await ids(`?sort=${sort}&order=${order}`)).toEqual(expected);
  });

  it('sorts by date descending by default', async () => {
    expect(await ids('?sort=date')).toEqual(await ids('?order=desc'));
  });
});

describe('GET /api/transactions pagination', () => {
  beforeEach(() => {
    insertRows(ctx.db);
  });

  it('returns a full first page and the total', async () => {
    const result = await list('?pageSize=3');
    expect(result.items.map((t) => t.id)).toEqual([8, 7, 6]);
    expect(result.total).toBe(8);
  });

  it('returns a partial last page', async () => {
    const result = await list('?pageSize=3&page=3');
    expect(result.items.map((t) => t.id)).toEqual([2, 1]);
    expect(result.total).toBe(8);
  });

  it('returns no items past the last page, with the total', async () => {
    const result = await list('?pageSize=3&page=4');
    expect(result.items).toEqual([]);
    expect(result.total).toBe(8);
  });

  it('pages cover every row exactly once, even across sort ties', async () => {
    const pages = await Promise.all(
      [1, 2, 3, 4, 5, 6, 7, 8].map((page) => ids(`?sort=amount&pageSize=1&page=${page}`)),
    );
    expect(pages.flat()).toEqual(await ids('?sort=amount'));
  });

  it('accepts the largest page size, 500', async () => {
    expect((await list('?pageSize=500')).items).toHaveLength(8);
  });

  it('counts the total over the filter, not the page', async () => {
    const result = await list('?category=none&pageSize=2&page=2');
    expect(result.items.map((t) => t.id)).toEqual([2]);
    expect(result.total).toBe(3);
  });
});

describe('GET /api/transactions on demo data', () => {
  it('returns every demo transaction and the uncategorized ones', async () => {
    const summary = seedDemo(ctx.db, { clock: fixedClock(TEST_NOW) });
    expect((await list('?pageSize=1')).total).toBe(summary.transactions);
    expect((await list('?category=none&pageSize=1')).total).toBe(
      summary.transactions - summary.categorized,
    );
  });
});

describe('PATCH /api/transactions/:id', () => {
  beforeEach(() => {
    insertRows(ctx.db);
  });

  it('records category_source manual when a category is set, and clears the rule', async () => {
    const home = categoryId(ctx.db, 'Home');
    const res = await send('PATCH', '/1', { categoryId: home });
    expect(res.status).toBe(200);
    const body = updateTransactionResponseSchema.parse(await res.json());
    expect(body).toMatchObject({
      id: 1,
      categoryId: home,
      categorySource: 'manual',
      ruleId: null,
      updatedAt: TEST_NOW,
    });
    expect(row(1)).toMatchObject({ categoryId: home, categorySource: 'manual', ruleId: null });
  });

  it('records category_source manual on an uncategorized row', async () => {
    await send('PATCH', '/2', { categoryId: categoryId(ctx.db, 'Coffee') });
    expect(row(2).categorySource).toBe('manual');
  });

  it('records an accepted suggestion', async () => {
    await send('PATCH', '/2', {
      categoryId: categoryId(ctx.db, 'Coffee'),
      categorySource: 'suggestion',
    });
    expect(row(2).categorySource).toBe('suggestion');
  });

  it('clears the category and its source', async () => {
    const res = await send('PATCH', '/1', { categoryId: null });
    expect(res.status).toBe(200);
    expect(row(1)).toMatchObject({ categoryId: null, categorySource: null, ruleId: null });
  });

  it('changes the owner, notes and excluded flag', async () => {
    const res = await send('PATCH', '/3', { ownerId: 1, notes: 'Split later', excluded: true });
    expect(res.status).toBe(200);
    expect(row(3)).toMatchObject({
      ownerId: 1,
      notes: 'Split later',
      excluded: true,
      // The category is untouched.
      categorySource: 'manual',
    });
    await send('PATCH', '/3', { notes: null });
    expect(row(3).notes).toBeNull();
  });

  it('leaves updated_at alone when nothing changes', async () => {
    const res = await send('PATCH', '/3', { ownerId: 3 });
    expect(updateTransactionResponseSchema.parse(await res.json()).updatedAt).toBe(EARLIER);
  });

  it('answers 404 for a missing transaction', async () => {
    const res = await send('PATCH', '/99', { ownerId: 1 });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('not_found');
  });

  it('answers 400 for an unknown owner or category', async () => {
    const owner = await send('PATCH', '/1', { ownerId: 99 });
    expect(owner.status).toBe(400);
    expect(await errorCode(owner)).toBe('invalid_reference');
    const category = await send('PATCH', '/1', { categoryId: 999 });
    expect(category.status).toBe(400);
    expect(await errorCode(category)).toBe('invalid_reference');
    expect(row(1).ownerId).toBe(1);
  });

  it('refuses to newly assign an archived category, but keeps one already set', async () => {
    const groceries = categoryId(ctx.db, 'Groceries');
    ctx.db.update(categories).set({ archived: true }).where(eq(categories.id, groceries)).run();
    const res = await send('PATCH', '/2', { categoryId: groceries });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('archived_category');
    expect((await send('PATCH', '/1', { categoryId: groceries })).status).toBe(200);
  });

  it.each([
    ['a categorySource without a category', { categorySource: 'suggestion' }],
    ['categorySource rule', { categoryId: 1, categorySource: 'rule' }],
    ['a non-numeric owner', { ownerId: 'Colin' }],
    ['a non-boolean excluded', { excluded: 'yes' }],
  ])('answers 400 for %s', async (_name, body) => {
    const res = await send('PATCH', '/1', body);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });

  it('answers 400 for a body that is not JSON and for a bad id', async () => {
    const res = await ctx.app.request('/api/transactions/1', { method: 'PATCH', body: '{' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_json');
    expect((await send('PATCH', '/abc', { ownerId: 1 })).status).toBe(400);
  });
});

describe('POST /api/transactions/bulk', () => {
  beforeEach(() => {
    insertRows(ctx.db);
  });

  it('categorizes several rows by hand and returns how many changed', async () => {
    const groceries = categoryId(ctx.db, 'Groceries');
    const res = await send('POST', '/bulk', { ids: [2, 5, 7], patch: { categoryId: groceries } });
    expect(res.status).toBe(200);
    expect(changedCountResponseSchema.parse(await res.json())).toEqual({ changed: 3 });
    for (const id of [2, 5, 7]) {
      expect(row(id)).toMatchObject({
        categoryId: groceries,
        categorySource: 'manual',
        updatedAt: TEST_NOW,
      });
    }
    expect(row(3).updatedAt).toBe(EARLIER);
  });

  it('counts only rows that actually changed, and ignores repeated ids', async () => {
    const res = await send('POST', '/bulk', { ids: [1, 4, 7, 7], patch: { ownerId: 1 } });
    expect(changedCountResponseSchema.parse(await res.json())).toEqual({ changed: 0 });
    const second = await send('POST', '/bulk', { ids: [1, 2, 2], patch: { ownerId: 3 } });
    expect(changedCountResponseSchema.parse(await second.json())).toEqual({ changed: 2 });
    expect(row(1).updatedAt).toBe(TEST_NOW);
  });

  it('excludes and includes rows', async () => {
    await send('POST', '/bulk', { ids: [1, 2], patch: { excluded: true } });
    expect(await ids('?excluded=true')).toEqual([5, 2, 1]);
  });

  it('changes nothing and answers 404 when any id is missing', async () => {
    const res = await send('POST', '/bulk', { ids: [1, 98, 99], patch: { ownerId: 2 } });
    expect(res.status).toBe(404);
    const error = apiErrorSchema.parse(await res.json()).error;
    expect(error.details).toEqual([98, 99]);
    expect(row(1).ownerId).toBe(1);
  });

  it('allows an archived category only when every row already has it', async () => {
    const groceries = categoryId(ctx.db, 'Groceries');
    ctx.db.update(categories).set({ archived: true }).where(eq(categories.id, groceries)).run();
    expect(
      (await send('POST', '/bulk', { ids: [1, 6], patch: { categoryId: groceries } })).status,
    ).toBe(200);
    const res = await send('POST', '/bulk', { ids: [1, 2], patch: { categoryId: groceries } });
    expect(res.status).toBe(400);
    expect(row(2).categoryId).toBeNull();
  });

  it.each([
    ['no ids', { ids: [], patch: { ownerId: 1 } }],
    ['no patch', { ids: [1] }],
    ['an unknown owner', { ids: [1], patch: { ownerId: 99 } }],
  ])('answers 400 for %s', async (_name, body) => {
    expect((await send('POST', '/bulk', body)).status).toBe(400);
  });
});

describe('GET /api/categories', () => {
  it('lists the seeded categories in display order', async () => {
    const res = await ctx.app.request('/api/categories');
    expect(res.status).toBe(200);
    const list = categoryListResponseSchema.parse(await res.json());
    expect(list).toHaveLength(28);
    expect(list.map((c) => c.sortOrder)).toEqual(
      [...list.map((c) => c.sortOrder)].sort((a, b) => a - b),
    );
    expect(list.find((c) => c.name === 'Card Payment')?.kind).toBe('transfer');
  });
});
