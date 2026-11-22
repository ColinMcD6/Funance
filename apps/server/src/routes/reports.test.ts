import { reportTotals } from '@funance/core';
import {
  apiErrorSchema,
  compareReportResponseSchema,
  monthlyReportResponseSchema,
  type CompareReportRow,
  type MonthlyReportRow,
} from '@funance/shared';
import { inArray } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { categories, transactions } from '../db/schema.js';
import { makeTempDir } from '../db/test-db.js';
import { categoryIdByName, insertTestRows, type TestRow } from '../db/test-rows.js';
import { makeTestApp } from '../test-app.js';

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

const COLIN = 1;
const EMILY = 2;
const JOINT = 3;

type Row = Omit<TestRow, 'categoryId'> & { category: string | null; excluded?: boolean };

/**
 * A small hand-written household. Every total the tests expect is worked out by hand in the
 * comments, never computed by the code under test.
 */
const SEPTEMBER: Row[] = [
  {
    date: '2026-09-12',
    ownerId: COLIN,
    category: 'Groceries',
    amountCents: -8000,
    description: 'S1',
  },
  {
    date: '2026-09-15',
    ownerId: EMILY,
    category: 'Income',
    amountCents: 200000,
    description: 'S2',
  },
];

const OCTOBER: Row[] = [
  {
    date: '2026-10-01',
    ownerId: COLIN,
    category: 'Groceries',
    amountCents: -10000,
    description: 'O1',
  },
  {
    date: '2026-10-02',
    ownerId: EMILY,
    category: 'Groceries',
    amountCents: -6000,
    description: 'O2',
  },
  {
    date: '2026-10-03',
    ownerId: JOINT,
    category: 'Groceries',
    amountCents: -4000,
    description: 'O3',
  },
  // A refund: reduces Groceries.
  {
    date: '2026-10-04',
    ownerId: JOINT,
    category: 'Groceries',
    amountCents: 1500,
    description: 'O4',
  },
  {
    date: '2026-10-05',
    ownerId: COLIN,
    category: 'Eating out',
    amountCents: -3000,
    description: 'O5',
  },
  { date: '2026-10-06', ownerId: EMILY, category: 'Coffee', amountCents: -500, description: 'O6' },
  {
    date: '2026-10-07',
    ownerId: COLIN,
    category: 'Income',
    amountCents: 300000,
    description: 'O7',
  },
  {
    date: '2026-10-08',
    ownerId: EMILY,
    category: 'Income',
    amountCents: 200000,
    description: 'O8',
  },
  // Savings: counts as saved, never as spending.
  {
    date: '2026-10-09',
    ownerId: COLIN,
    category: 'Investing',
    amountCents: -50000,
    description: 'O9',
  },
  {
    date: '2026-10-10',
    ownerId: JOINT,
    category: 'Debt Payments',
    amountCents: -20000,
    description: 'O10',
  },
  // A transfer: absent from every total.
  {
    date: '2026-10-11',
    ownerId: JOINT,
    category: 'Card Payment',
    amountCents: -150000,
    description: 'O11',
  },
  // Excluded: absent from every total.
  {
    date: '2026-10-12',
    ownerId: EMILY,
    category: 'Eating out',
    amountCents: -99999,
    description: 'O12',
    excluded: true,
  },
  // Uncategorized: its own bucket.
  { date: '2026-10-13', ownerId: COLIN, category: null, amountCents: -2500, description: 'O13' },
  { date: '2026-10-31', ownerId: JOINT, category: null, amountCents: -700, description: 'O14' },
];

// Outside October: must not leak into an October-only report.
const NOVEMBER: Row[] = [
  {
    date: '2026-11-01',
    ownerId: COLIN,
    category: 'Groceries',
    amountCents: -12345,
    description: 'N1',
  },
];

function insertRows(rows: readonly Row[]): void {
  const ids = insertTestRows(
    ctx.db,
    rows.map((row) => ({
      ...row,
      categoryId: row.category === null ? null : categoryIdByName(ctx.db, row.category),
    })),
  );
  const excludedIds = ids.filter((_, i) => rows[i]?.excluded === true);
  if (excludedIds.length > 0) {
    ctx.db
      .update(transactions)
      .set({ excluded: true })
      .where(inArray(transactions.id, excludedIds))
      .run();
  }
}

function seedHousehold(): void {
  insertRows([...SEPTEMBER, ...OCTOBER, ...NOVEMBER]);
}

const id = (name: string) => categoryIdByName(ctx.db, name);

async function monthly(query: string): Promise<MonthlyReportRow[]> {
  const res = await ctx.app.request(`/api/reports/monthly?${query}`);
  expect(res.status).toBe(200);
  return monthlyReportResponseSchema.parse(await res.json()).rows;
}

async function compare(query: string): Promise<CompareReportRow[]> {
  const res = await ctx.app.request(`/api/reports/compare?${query}`);
  expect(res.status).toBe(200);
  return compareReportResponseSchema.parse(await res.json()).rows;
}

function byCategory(rows: readonly MonthlyReportRow[], name: string | null) {
  const categoryId = name === null ? null : id(name);
  return rows.find((r) => r.categoryId === categoryId && (name !== null || r.groupName === null));
}

describe('GET /reports/monthly', () => {
  beforeEach(seedHousehold);

  it('gives each category of a month its own kind total; a refund reduces its category', async () => {
    const rows = await monthly('from=2026-10&to=2026-10');
    // Groceries: 10000 + 6000 + 4000 - 1500 refund = 18500.
    expect(byCategory(rows, 'Groceries')).toEqual({
      month: '2026-10',
      categoryId: id('Groceries'),
      groupName: 'Groceries',
      spendingCents: 18500,
      incomeCents: 0,
      savedCents: 0,
      count: 4,
    });
    expect(byCategory(rows, 'Income')).toMatchObject({ incomeCents: 500000, spendingCents: 0 });
    expect(byCategory(rows, 'Eating out')).toMatchObject({ spendingCents: 3000, count: 1 });
    expect(byCategory(rows, 'Debt Payments')).toMatchObject({ spendingCents: 20000 });
  });

  it('leaves transfers and excluded rows out', async () => {
    const rows = await monthly('from=2026-10&to=2026-10');
    expect(byCategory(rows, 'Card Payment')).toBeUndefined();
    // The excluded 99999 Eating out row is not in the Eating out total of 3000.
    expect(byCategory(rows, 'Eating out')?.spendingCents).toBe(3000);
    // 14 October rows minus the transfer and the excluded row.
    expect(rows.reduce((n, r) => n + r.count, 0)).toBe(12);
  });

  it('counts savings categories toward saved and not toward spending', async () => {
    const rows = await monthly('from=2026-10&to=2026-10');
    expect(byCategory(rows, 'Investing')).toMatchObject({
      spendingCents: 0,
      incomeCents: 0,
      savedCents: 50000,
    });
  });

  it('puts uncategorized rows in their own bucket', async () => {
    const rows = await monthly('from=2026-10&to=2026-10');
    expect(byCategory(rows, null)).toEqual({
      month: '2026-10',
      categoryId: null,
      groupName: null,
      spendingCents: 3200, // 2500 + 700
      incomeCents: 0,
      savedCents: 0,
      count: 2,
    });
  });

  it('household totals: left over equals income minus spending minus saved', async () => {
    const totals = reportTotals(await monthly('from=2026-10&to=2026-10'));
    // Spending: Groceries 18500 + Eating out 3000 + Coffee 500 + Debt Payments 20000 = 42000.
    // Income 300000 + 200000. Saved 50000. Left over 500000 - 42000 - 50000 = 408000.
    expect(totals).toEqual({
      spendingCents: 42000,
      incomeCents: 500000,
      savedCents: 50000,
      leftOverCents: 408000,
      uncategorizedCents: 3200,
      uncategorizedCount: 2,
    });
  });

  it.each([
    // Colin: Groceries 10000 + Eating out 3000; income 300000; saved 50000; uncategorized 2500.
    [
      COLIN,
      {
        spendingCents: 13000,
        incomeCents: 300000,
        savedCents: 50000,
        leftOverCents: 237000,
        uncategorizedCents: 2500,
        uncategorizedCount: 1,
      },
    ],
    // Emily: Groceries 6000 + Coffee 500; income 200000 (the excluded row does not count).
    [
      EMILY,
      {
        spendingCents: 6500,
        incomeCents: 200000,
        savedCents: 0,
        leftOverCents: 193500,
        uncategorizedCents: 0,
        uncategorizedCount: 0,
      },
    ],
    // Joint: Groceries 4000 - 1500 + Debt Payments 20000; uncategorized 700.
    [
      JOINT,
      {
        spendingCents: 22500,
        incomeCents: 0,
        savedCents: 0,
        leftOverCents: -22500,
        uncategorizedCents: 700,
        uncategorizedCount: 1,
      },
    ],
  ])('owner %i matches a manual sum', async (owner, expected) => {
    expect(reportTotals(await monthly(`from=2026-10&to=2026-10&owner=${owner}`))).toEqual(expected);
  });

  it('All equals the sum of the three owners, row by row', async () => {
    const all = await monthly('from=2026-09&to=2026-11');
    const perOwner = (
      await Promise.all(
        [COLIN, EMILY, JOINT].map((o) => monthly(`from=2026-09&to=2026-11&owner=${o}`)),
      )
    ).flat();
    for (const row of all) {
      const parts = perOwner.filter(
        (r) =>
          r.month === row.month && r.categoryId === row.categoryId && r.groupName === row.groupName,
      );
      const add = (key: 'spendingCents' | 'incomeCents' | 'savedCents' | 'count') =>
        parts.reduce((n, r) => n + r[key], 0);
      expect(row).toEqual({
        ...row,
        spendingCents: add('spendingCents'),
        incomeCents: add('incomeCents'),
        savedCents: add('savedCents'),
        count: add('count'),
      });
    }
    expect(all.reduce((n, r) => n + r.count, 0)).toBe(perOwner.reduce((n, r) => n + r.count, 0));
  });

  it('splits by month over a range, and a month outside the range never leaks in', async () => {
    const rows = await monthly('from=2026-09&to=2026-10');
    expect(rows.map((r) => r.month).every((m) => m === '2026-09' || m === '2026-10')).toBe(true);
    const september = rows.filter((r) => r.month === '2026-09');
    expect(reportTotals(september)).toMatchObject({ spendingCents: 8000, incomeCents: 200000 });
    const november = await monthly('from=2026-11&to=2026-11');
    expect(reportTotals(november).spendingCents).toBe(12345);
  });

  it('groups by major category, adding up each kind inside a mixed group', async () => {
    const rows = await monthly('from=2026-10&to=2026-10&groupBy=group');
    const group = (name: string | null) => rows.find((r) => r.groupName === name);
    expect(rows.every((r) => r.categoryId === null)).toBe(true);
    expect(group('Groceries')).toMatchObject({ spendingCents: 18500, count: 4 });
    // Joy: Eating out 3000 + Coffee 500.
    expect(group('Joy')).toMatchObject({ spendingCents: 3500, count: 2 });
    // Money holds Income, Investing and Debt Payments.
    expect(group('Money')).toEqual({
      month: '2026-10',
      categoryId: null,
      groupName: 'Money',
      spendingCents: 20000,
      incomeCents: 500000,
      savedCents: 50000,
      count: 4,
    });
    expect(group('Transfers')).toBeUndefined();
    expect(group(null)).toMatchObject({ spendingCents: 3200, count: 2 });
    expect(reportTotals(rows)).toEqual(reportTotals(await monthly('from=2026-10&to=2026-10')));
  });

  it('counts archived categories like any other', async () => {
    ctx.db
      .update(categories)
      .set({ archived: true })
      .where(inArray(categories.id, [id('Coffee')]))
      .run();
    const rows = await monthly('from=2026-10&to=2026-10');
    expect(byCategory(rows, 'Coffee')).toMatchObject({ spendingCents: 500 });
  });

  it('returns no rows for a range without data', async () => {
    expect(await monthly('from=2020-01&to=2020-12')).toEqual([]);
  });

  it.each([
    ['from=2026-10&to=2026-09', 'from after to'],
    ['from=2026-13&to=2026-12', 'bad month'],
    ['to=2026-10', 'missing from'],
    ['from=2026-10&to=2026-10&owner=0', 'bad owner'],
    ['from=2026-10&to=2026-10&groupBy=account', 'bad grouping'],
  ])('rejects %s with 400 (%s)', async (query) => {
    const res = await ctx.app.request(`/api/reports/monthly?${query}`);
    expect(res.status).toBe(400);
    apiErrorSchema.parse(await res.json());
  });
});

describe('GET /reports/compare', () => {
  beforeEach(seedHousehold);

  const find = (rows: CompareReportRow[], name: string | null) =>
    rows.find((r) => r.categoryId === (name === null ? null : id(name)));

  it('compares each category with the previous month and the trailing average', async () => {
    const rows = await compare('month=2026-10');
    // Only September has data among July to September, so the average is September alone.
    expect(find(rows, 'Groceries')).toEqual({
      categoryId: id('Groceries'),
      thisMonthCents: 18500,
      previousMonthCents: 8000,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 8000,
    });
    expect(find(rows, 'Income')).toMatchObject({
      thisMonthCents: 500000,
      previousMonthCents: 200000,
    });
    // No Eating out in September, which has other data: zero, not null.
    expect(find(rows, 'Eating out')).toMatchObject({
      thisMonthCents: 3000,
      previousMonthCents: 0,
      trailing3MonthAvgCents: 0,
    });
    expect(find(rows, 'Investing')?.thisMonthCents).toBe(50000);
    expect(find(rows, null)).toMatchObject({ thisMonthCents: 3200, previousMonthCents: 0 });
    expect(find(rows, 'Card Payment')).toBeUndefined();
  });

  it('returns null, not zero, for a month with no prior-year data', async () => {
    const rows = await compare('month=2026-10');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row.sameMonthLastYearCents).toBeNull();
    // Nothing at all before September 2026: every comparison of September is null.
    for (const row of await compare('month=2026-09')) {
      expect(row.previousMonthCents).toBeNull();
      expect(row.sameMonthLastYearCents).toBeNull();
      expect(row.trailing3MonthAvgCents).toBeNull();
    }
  });

  it('fills the same month last year once it has data, and averages three months', async () => {
    insertRows([
      {
        date: '2025-10-20',
        ownerId: EMILY,
        category: 'Coffee',
        amountCents: -100,
        description: 'L1',
      },
      {
        date: '2026-07-20',
        ownerId: COLIN,
        category: 'Groceries',
        amountCents: -1000,
        description: 'L2',
      },
      {
        date: '2026-08-20',
        ownerId: COLIN,
        category: 'Groceries',
        amountCents: -2001,
        description: 'L3',
      },
    ]);
    const rows = await compare('month=2026-10');
    expect(find(rows, 'Groceries')).toMatchObject({
      sameMonthLastYearCents: 0,
      // (1000 + 2001 + 8000) / 3 = 3667
      trailing3MonthAvgCents: 3667,
    });
    expect(find(rows, 'Coffee')).toMatchObject({
      thisMonthCents: 500,
      sameMonthLastYearCents: 100,
    });
  });

  it('filters by owner; a month with data from another owner is zero, not null', async () => {
    const rows = await compare('month=2026-10&owner=2');
    expect(find(rows, 'Groceries')).toEqual({
      categoryId: id('Groceries'),
      thisMonthCents: 6000,
      previousMonthCents: 0,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 0,
    });
    expect(find(rows, 'Income')).toMatchObject({
      thisMonthCents: 200000,
      previousMonthCents: 200000,
    });
    expect(find(rows, 'Investing')).toBeUndefined();
  });

  it('lists categories in their display order with uncategorized last', async () => {
    const rows = await compare('month=2026-10');
    expect(rows.at(-1)?.categoryId).toBeNull();
    const order = ctx.db.select().from(categories).all();
    const sortOf = (cid: number | null) => order.find((c) => c.id === cid)?.sortOrder ?? Infinity;
    const sorts = rows.map((r) => sortOf(r.categoryId));
    expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
  });

  it('rejects a bad month with 400', async () => {
    const res = await ctx.app.request('/api/reports/compare?month=2026-1');
    expect(res.status).toBe(400);
  });
});

describe('legacy rows', () => {
  it('count under every owner filter, like statement rows', async () => {
    insertRows([
      {
        date: '2026-10-05',
        accountId: null,
        ownerId: COLIN,
        category: 'Groceries',
        amountCents: -1100,
        description: 'L-C',
      },
      {
        date: '2026-10-06',
        accountId: null,
        ownerId: EMILY,
        category: 'Groceries',
        amountCents: -2200,
        description: 'L-E',
      },
      {
        date: '2026-10-07',
        accountId: null,
        ownerId: JOINT,
        category: 'Groceries',
        amountCents: -3300,
        description: 'L-J',
      },
      {
        date: '2026-10-08',
        accountId: 1,
        ownerId: JOINT,
        category: 'Groceries',
        amountCents: -4400,
        description: 'S-J',
      },
    ]);
    const spending = async (owner: string) =>
      reportTotals(await monthly(`from=2026-10&to=2026-10&owner=${owner}`)).spendingCents;
    expect(await spending('1')).toBe(1100);
    expect(await spending('2')).toBe(2200);
    expect(await spending('3')).toBe(3300 + 4400);
    expect(await spending('all')).toBe(1100 + 2200 + 3300 + 4400);
    expect(find(await compare('month=2026-10&owner=3'), 'Groceries')?.thisMonthCents).toBe(7700);
  });
});

function find(rows: CompareReportRow[], name: string) {
  return rows.find((r) => r.categoryId === categoryIdByName(ctx.db, name));
}
