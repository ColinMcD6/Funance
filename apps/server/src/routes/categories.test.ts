import {
  apiErrorSchema,
  archiveCategoryResponseSchema,
  categoryListResponseSchema,
  createCategoryResponseSchema,
  updateCategoryResponseSchema,
  type CreateCategoryRequest,
} from '@funance/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rules } from '../db/schema.js';
import { makeTempDir } from '../db/test-db.js';
import { categoryIdByName, getTestRow, insertTestRows } from '../db/test-rows.js';
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

function send(method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return ctx.app.request(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function errorOf(res: Response) {
  return apiErrorSchema.parse(await res.json()).error;
}

async function list() {
  const res = await ctx.app.request('/api/categories');
  expect(res.status).toBe(200);
  return categoryListResponseSchema.parse(await res.json());
}

const PETS: CreateCategoryRequest = {
  name: 'Pet Insurance',
  kind: 'expense',
  color: '#336699',
  groupName: 'Pet',
};

async function create(body: CreateCategoryRequest = PETS) {
  const res = await send('POST', '/categories', body);
  expect(res.status).toBe(201);
  return createCategoryResponseSchema.parse(await res.json());
}

async function archive(id: number, reassignTo?: number) {
  const query = reassignTo === undefined ? '' : `?reassignTo=${reassignTo}`;
  return send('DELETE', `/categories/${id}${query}`);
}

describe('GET /api/categories', () => {
  it('lists the seeded categories in sort order', async () => {
    const categories = await list();
    expect(categories).toHaveLength(28);
    const orders = categories.map((c) => c.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });
});

describe('POST /api/categories', () => {
  it('creates a category after the last one', async () => {
    const before = await list();
    const created = await create();
    expect(created).toMatchObject({ ...PETS, archived: false });
    expect(created.sortOrder).toBe(Math.max(...before.map((c) => c.sortOrder)) + 1);
    expect((await list()).at(-1)?.id).toBe(created.id);
  });

  it('takes an explicit sort order and any kind', async () => {
    const created = await create({ ...PETS, kind: 'savings', sortOrder: 0 });
    expect(created).toMatchObject({ kind: 'savings', sortOrder: 0 });
    expect((await list())[0]?.id).toBe(created.id);
  });

  it('answers 409 for a name that exists, ignoring case', async () => {
    const res = await send('POST', '/categories', { ...PETS, name: 'groceries' });
    expect(res.status).toBe(409);
    expect((await errorOf(res)).message).toMatch(/Groceries/);
  });

  it.each([
    ['an unknown kind', { kind: 'debt' }],
    ['a bad color', { color: 'blue' }],
    ['an empty name', { name: '' }],
    ['no group', { groupName: undefined }],
  ])('rejects %s with 400', async (_what, overrides) => {
    const res = await send('POST', '/categories', { ...PETS, ...overrides });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('validation_error');
  });
});

describe('PATCH /api/categories/:id', () => {
  it('renames and changes kind, color, group and order', async () => {
    const id = categoryIdByName(ctx.db, 'Investing');
    const res = await send('PATCH', `/categories/${id}`, {
      name: 'Investments',
      kind: 'expense',
      color: '#aabbcc',
      groupName: 'Savings',
      sortOrder: 99,
    });
    expect(res.status).toBe(200);
    expect(updateCategoryResponseSchema.parse(await res.json())).toMatchObject({
      id,
      name: 'Investments',
      kind: 'expense',
      color: '#aabbcc',
      groupName: 'Savings',
      sortOrder: 99,
    });
  });

  it('allows a change of case in its own name but not another category’s name', async () => {
    const id = categoryIdByName(ctx.db, 'Groceries');
    expect((await send('PATCH', `/categories/${id}`, { name: 'GROCERIES' })).status).toBe(200);
    expect((await send('PATCH', `/categories/${id}`, { name: 'Home' })).status).toBe(409);
  });

  it('archives with archived: true (disabling its rules) and restores with false', async () => {
    const cardPayment = categoryIdByName(ctx.db, 'Card Payment');
    let res = await send('PATCH', `/categories/${cardPayment}`, { archived: true });
    expect(updateCategoryResponseSchema.parse(await res.json()).archived).toBe(true);
    const seeded = ctx.db.select().from(rules).where(eq(rules.setCategoryId, cardPayment)).all();
    expect(seeded.map((r) => r.enabled)).toEqual([false, false, false]);
    res = await send('PATCH', `/categories/${cardPayment}`, { archived: false });
    expect(updateCategoryResponseSchema.parse(await res.json()).archived).toBe(false);
  });

  it('answers 404 for a missing category and 400 for a bad body', async () => {
    expect((await send('PATCH', '/categories/999', { name: 'X' })).status).toBe(404);
    expect((await send('PATCH', '/categories/1', { kind: 'nope' })).status).toBe(400);
  });
});

describe('DELETE /api/categories/:id', () => {
  it('without reassignTo, archives and the transactions keep the archived category', async () => {
    const coffee = categoryIdByName(ctx.db, 'Coffee');
    const [a, b] = insertTestRows(ctx.db, [
      { description: 'Tim Hortons', categoryId: coffee },
      { description: 'Starbucks', categoryId: coffee },
    ]);
    const res = await archive(coffee);
    expect(res.status).toBe(200);
    expect(archiveCategoryResponseSchema.parse(await res.json())).toMatchObject({
      id: coffee,
      archived: true,
    });
    for (const id of [a, b]) {
      expect(getTestRow(ctx.db, id ?? 0)).toMatchObject({
        categoryId: coffee,
        updatedAt: '2026-01-01T00:00:00.000Z',
      });
    }
    // Archived categories stay in the list, for history.
    expect((await list()).find((c) => c.id === coffee)?.archived).toBe(true);
  });

  it('with reassignTo, moves its transactions and rules first', async () => {
    const coffee = categoryIdByName(ctx.db, 'Coffee');
    const eatingOut = categoryIdByName(ctx.db, 'Eating out');
    const other = categoryIdByName(ctx.db, 'Home');
    const rule = ctx.db
      .insert(rules)
      .values({
        priority: 50,
        matchField: 'description',
        matchType: 'contains',
        pattern: 'TIM HORTONS',
        accountId: null,
        direction: null,
        setCategoryId: coffee,
        setOwnerId: null,
        enabled: true,
        createdAt: TEST_NOW,
      })
      .returning()
      .get();
    const [manual, byRule, untouched] = insertTestRows(ctx.db, [
      { description: 'Starbucks', categoryId: coffee },
      { description: 'Tim Hortons', categoryId: coffee, categorySource: 'rule', ruleId: rule.id },
      { description: 'Hardware', categoryId: other },
    ]);
    const res = await archive(coffee, eatingOut);
    expect(res.status).toBe(200);
    expect(getTestRow(ctx.db, manual ?? 0)).toMatchObject({
      categoryId: eatingOut,
      categorySource: 'manual',
      updatedAt: TEST_NOW,
    });
    expect(getTestRow(ctx.db, byRule ?? 0)).toMatchObject({
      categoryId: eatingOut,
      categorySource: 'rule',
      ruleId: rule.id,
    });
    expect(getTestRow(ctx.db, untouched ?? 0).categoryId).toBe(other);
    const moved = ctx.db.select().from(rules).where(eq(rules.id, rule.id)).get();
    expect(moved).toMatchObject({ setCategoryId: eatingOut, enabled: true });
    const list = await ctx.app.request(`/api/transactions?category=${coffee}`);
    expect(((await list.json()) as { total: number }).total).toBe(0);
  });

  it('rejects reassigning to itself, an unknown category, or an archived one, changing nothing', async () => {
    const coffee = categoryIdByName(ctx.db, 'Coffee');
    const alcohol = categoryIdByName(ctx.db, 'Alcohol');
    const [row] = insertTestRows(ctx.db, [{ description: 'Tim Hortons', categoryId: coffee }]);
    await archive(alcohol);
    for (const target of [coffee, 999, alcohol]) {
      const res = await archive(coffee, target);
      expect(res.status).toBe(400);
    }
    expect((await list()).find((c) => c.id === coffee)?.archived).toBe(false);
    expect(getTestRow(ctx.db, row ?? 0).categoryId).toBe(coffee);
  });

  it('answers 404 for a missing category and 400 for a bad reassignTo', async () => {
    expect((await archive(999)).status).toBe(404);
    expect((await send('DELETE', '/categories/1?reassignTo=abc')).status).toBe(400);
  });

  it('an archived category can no longer be assigned to a transaction', async () => {
    const coffee = categoryIdByName(ctx.db, 'Coffee');
    const [row] = insertTestRows(ctx.db, [{ description: 'Tim Hortons' }]);
    await archive(coffee);
    const res = await send('PATCH', `/transactions/${row}`, { categoryId: coffee });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('archived_category');
  });
});
