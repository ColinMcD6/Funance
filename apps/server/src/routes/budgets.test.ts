import { budgetForView } from '@funance/core';
import { apiErrorSchema, budgetListResponseSchema, type PutBudgetsRequest } from '@funance/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../db/test-db.js';
import { categoryIdByName } from '../db/test-rows.js';
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

async function put(budgets: PutBudgetsRequest['budgets']) {
  return ctx.app.request('/api/budgets', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ budgets }),
  });
}

async function list() {
  const res = await ctx.app.request('/api/budgets');
  expect(res.status).toBe(200);
  return budgetListResponseSchema.parse(await res.json());
}

describe('GET /budgets', () => {
  it('is empty on a new database', async () => {
    expect(await list()).toEqual([]);
  });
});

describe('PUT /budgets', () => {
  it('stores the rows and returns them, household before owners, oldest month first', async () => {
    const groceries = categoryIdByName(ctx.db, 'Groceries');
    const coffee = categoryIdByName(ctx.db, 'Coffee');
    const res = await put([
      { categoryId: coffee, ownerId: EMILY, monthlyAmountCents: 3000, effectiveFrom: '2026-01' },
      { categoryId: groceries, ownerId: null, monthlyAmountCents: 90000, effectiveFrom: '2026-06' },
      { categoryId: groceries, ownerId: null, monthlyAmountCents: 80000, effectiveFrom: '2026-01' },
      { categoryId: coffee, ownerId: null, monthlyAmountCents: 0, effectiveFrom: '2026-01' },
    ]);
    expect(res.status).toBe(200);
    const body = budgetListResponseSchema.parse(await res.json());
    // Seeded order puts Groceries (4th) before Coffee (5th).
    expect(groceries).toBeLessThan(coffee);
    expect(
      body.map((b) => [b.categoryId, b.ownerId, b.effectiveFrom, b.monthlyAmountCents]),
    ).toEqual([
      [groceries, null, '2026-01', 80000],
      [groceries, null, '2026-06', 90000],
      [coffee, null, '2026-01', 0],
      [coffee, EMILY, '2026-01', 3000],
    ]);
    expect(await list()).toEqual(body);
  });

  it('replaces every row, and an empty list clears them', async () => {
    const groceries = categoryIdByName(ctx.db, 'Groceries');
    await put([
      { categoryId: groceries, ownerId: null, monthlyAmountCents: 1, effectiveFrom: '2026-01' },
      { categoryId: groceries, ownerId: COLIN, monthlyAmountCents: 2, effectiveFrom: '2026-01' },
    ]);
    await put([
      { categoryId: groceries, ownerId: JOINT, monthlyAmountCents: 3, effectiveFrom: '2026-02' },
    ]);
    expect((await list()).map((b) => [b.ownerId, b.monthlyAmountCents])).toEqual([[JOINT, 3]]);
    expect((await put([])).status).toBe(200);
    expect(await list()).toEqual([]);
  });

  it('accepts savings, income and archived categories', async () => {
    const investing = categoryIdByName(ctx.db, 'Investing');
    const income = categoryIdByName(ctx.db, 'Income');
    const baby = categoryIdByName(ctx.db, 'Baby');
    const archived = await ctx.app.request(`/api/categories/${baby}`, { method: 'DELETE' });
    expect(archived.status).toBe(200);
    const res = await put([
      { categoryId: investing, ownerId: null, monthlyAmountCents: 50000, effectiveFrom: '2026-01' },
      { categoryId: income, ownerId: null, monthlyAmountCents: 500000, effectiveFrom: '2026-01' },
      { categoryId: baby, ownerId: null, monthlyAmountCents: 1000, effectiveFrom: '2026-01' },
    ]);
    expect(res.status).toBe(200);
    expect(await list()).toHaveLength(3);
  });

  it.each([
    ['a negative amount', { monthlyAmountCents: -1 }],
    ['a fractional amount', { monthlyAmountCents: 10.5 }],
    ['a bad month', { effectiveFrom: '2026-13' }],
    ['a full date', { effectiveFrom: '2026-01-01' }],
  ])('rejects %s with 400 and keeps the old rows', async (_name, change) => {
    const groceries = categoryIdByName(ctx.db, 'Groceries');
    const good = {
      categoryId: groceries,
      ownerId: null,
      monthlyAmountCents: 1,
      effectiveFrom: '2026-01',
    };
    await put([good]);
    const res = await put([{ ...good, ...change }]);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error');
    expect(await list()).toHaveLength(1);
  });

  it('rejects two rows for the same category, owner and month', async () => {
    const groceries = categoryIdByName(ctx.db, 'Groceries');
    const row = {
      categoryId: groceries,
      ownerId: COLIN,
      monthlyAmountCents: 1,
      effectiveFrom: '2026-01',
    };
    const res = await put([row, { ...row, ownerId: null }, { ...row, monthlyAmountCents: 2 }]);
    expect(res.status).toBe(400);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details).toEqual({ indexes: [0, 2] });
  });

  it('rejects a transfer category', async () => {
    const res = await put([
      {
        categoryId: categoryIdByName(ctx.db, 'Card Payment'),
        ownerId: null,
        monthlyAmountCents: 1,
        effectiveFrom: '2026-01',
      },
    ]);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error');
  });

  it('rejects an unknown category or owner and changes nothing', async () => {
    const groceries = categoryIdByName(ctx.db, 'Groceries');
    const good = {
      categoryId: groceries,
      ownerId: null,
      monthlyAmountCents: 1,
      effectiveFrom: '2026-01',
    };
    await put([good]);
    for (const bad of [
      { ...good, categoryId: 9999 },
      { ...good, ownerId: 9999 },
    ]) {
      const res = await put([{ ...good, effectiveFrom: '2026-02' }, bad]);
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe('invalid_reference');
    }
    expect((await list()).map((b) => b.effectiveFrom)).toEqual(['2026-01']);
  });

  it('rejects a body that is not { budgets: [...] }', async () => {
    const res = await ctx.app.request('/api/budgets', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify([]),
    });
    expect(res.status).toBe(400);
  });
});

describe('stored budgets through the lookup', () => {
  // The acceptance criterion: effective-from lookup and household versus per-owner budgets,
  // on rows that went through the API. Expected amounts are written out by hand.
  it('applies the latest row at or before a month, per owner and for the household', async () => {
    const groceries = categoryIdByName(ctx.db, 'Groceries');
    await put([
      { categoryId: groceries, ownerId: null, monthlyAmountCents: 80000, effectiveFrom: '2026-01' },
      { categoryId: groceries, ownerId: null, monthlyAmountCents: 95000, effectiveFrom: '2026-07' },
      {
        categoryId: groceries,
        ownerId: COLIN,
        monthlyAmountCents: 30000,
        effectiveFrom: '2026-03',
      },
      {
        categoryId: groceries,
        ownerId: EMILY,
        monthlyAmountCents: 25000,
        effectiveFrom: '2026-01',
      },
    ]);
    const stored = await list();
    const at = (owner: number | 'all', month: string) =>
      budgetForView(stored, groceries, owner, month);

    expect(at('all', '2025-12')).toBeNull();
    expect(at('all', '2026-01')).toBe(80000);
    expect(at('all', '2026-06')).toBe(80000);
    expect(at('all', '2026-07')).toBe(95000);
    expect(at('all', '2027-02')).toBe(95000);

    expect(at(COLIN, '2026-02')).toBeNull();
    expect(at(COLIN, '2026-03')).toBe(30000);
    expect(at(EMILY, '2026-10')).toBe(25000);
    expect(at(JOINT, '2026-10')).toBeNull();
  });
});
