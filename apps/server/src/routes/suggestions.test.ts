import {
  transactionListResponseSchema,
  updateTransactionResponseSchema,
  type TransactionListItem,
} from '@funance/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { categoryIdByName, getTestRow, insertTestRows, type TestRow } from '../db/test-rows.js';
import { makeTempDir } from '../db/test-db.js';
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

const id = (name: string) => categoryIdByName(ctx.db, name);

/** GET /transactions with `query`, parsed by the response schema. */
async function list(query: string) {
  const res = await ctx.app.request(`/api/transactions?${query}`);
  expect(res.status).toBe(200);
  return transactionListResponseSchema.parse(await res.json());
}

async function uncategorized(): Promise<Map<string, TransactionListItem>> {
  const { items } = await list('category=none&pageSize=500');
  return new Map(items.map((t) => [t.description, t]));
}

function categorized(description: string, category: string, extra: Partial<TestRow> = {}) {
  return { description, categoryId: id(category), ...extra };
}

describe('GET /api/transactions?category=none suggestions', () => {
  it('suggests the most frequent category among rows with the same merchant key', async () => {
    insertTestRows(ctx.db, [
      categorized('WAL-MART #1', 'Groceries', { merchantKey: 'WAL-MART WINNIPEG' }),
      categorized('WAL-MART #2', 'Groceries', { merchantKey: 'WAL-MART WINNIPEG' }),
      // Another source of history counts the same way as a manual choice.
      categorized('WAL-MART #3', 'Groceries', {
        merchantKey: 'WAL-MART WINNIPEG',
        categorySource: 'suggestion',
      }),
      categorized('WAL-MART #4', 'Home', { merchantKey: 'WAL-MART WINNIPEG' }),
      categorized('WAL-MART #5', 'Home', { merchantKey: 'WAL-MART WINNIPEG' }),
      // A different merchant key with lots of Home does not count.
      categorized('HOME DEPOT #1', 'Home', { merchantKey: 'HOME DEPOT' }),
      categorized('HOME DEPOT #2', 'Home', { merchantKey: 'HOME DEPOT' }),
      // The merchant history wins over the bank category pairing.
      categorized('OTHER #1', 'Clothing', { bankCategory: 'Retail' }),
      categorized('OTHER #2', 'Clothing', { bankCategory: 'Retail' }),
      categorized('OTHER #3', 'Clothing', { bankCategory: 'Retail' }),
      { description: 'WAL-MART #9', merchantKey: 'WAL-MART WINNIPEG', bankCategory: 'Retail' },
    ]);
    const item = (await uncategorized()).get('WAL-MART #9');
    expect(item?.suggestedCategoryId).toBe(id('Groceries'));
  });

  it('breaks a tie by the most recently used category', async () => {
    insertTestRows(ctx.db, [
      categorized('A', 'Coffee', { merchantKey: 'CAFE', date: '2026-09-01' }),
      categorized('B', 'Eating out', { merchantKey: 'CAFE', date: '2026-09-20' }),
      { description: 'C', merchantKey: 'CAFE' },
    ]);
    expect((await uncategorized()).get('C')?.suggestedCategoryId).toBe(id('Eating out'));
  });

  it('falls back to the category most often paired with the bank category', async () => {
    insertTestRows(ctx.db, [
      categorized('SHELL 1', 'Gas', { bankCategory: 'Fuel' }),
      categorized('SHELL 2', 'Gas', { bankCategory: 'Fuel' }),
      categorized('ESSO 1', 'Car Maintenance', { bankCategory: 'Fuel' }),
      // Bank categories are matched exactly, not by a part of the label.
      categorized('X 1', 'Travel', { bankCategory: 'Fuel and more' }),
      categorized('X 2', 'Travel', { bankCategory: 'Fuel and more' }),
      categorized('X 3', 'Travel', { bankCategory: 'Fuel and more' }),
      { description: 'PETRO-CANADA 0456', merchantKey: 'PETRO-CANADA', bankCategory: 'Fuel' },
    ]);
    expect((await uncategorized()).get('PETRO-CANADA 0456')?.suggestedCategoryId).toBe(id('Gas'));
  });

  it('gives null when neither the merchant nor the bank category has history', async () => {
    insertTestRows(ctx.db, [
      categorized('SHELL 1', 'Gas', { bankCategory: 'Fuel' }),
      // Uncategorized rows are not history.
      { description: 'NEW PLACE 1', merchantKey: 'NEW PLACE', bankCategory: 'Shops' },
      { description: 'NEW PLACE 2', merchantKey: 'NEW PLACE', bankCategory: 'Shops' },
      // No bank category at all.
      { description: 'NO BANK CATEGORY', merchantKey: 'NOWHERE' },
    ]);
    const items = await uncategorized();
    expect(items.get('NEW PLACE 1')?.suggestedCategoryId).toBeNull();
    expect(items.get('NEW PLACE 2')?.suggestedCategoryId).toBeNull();
    expect(items.get('NO BANK CATEGORY')?.suggestedCategoryId).toBeNull();
  });

  it('never suggests an archived category', async () => {
    insertTestRows(ctx.db, [
      categorized('CAT FOOD 1', 'Cat', { merchantKey: 'PET STORE', bankCategory: 'Pets' }),
      categorized('CAT FOOD 2', 'Cat', { merchantKey: 'PET STORE', bankCategory: 'Pets' }),
      categorized('GIFT', 'Gifts', { merchantKey: 'GIFT SHOP', bankCategory: 'Pets' }),
      { description: 'PET STORE 3', merchantKey: 'PET STORE', bankCategory: 'Pets' },
    ]);
    const archive = await ctx.app.request(`/api/categories/${id('Cat')}`, { method: 'DELETE' });
    expect(archive.status).toBe(200);
    // Cat is archived and its rows keep it, so the merchant has no usable history: the bank
    // category pairing (Gifts) is next.
    expect((await uncategorized()).get('PET STORE 3')?.suggestedCategoryId).toBe(id('Gifts'));
  });

  it('suggests for every row of the page, including rows beyond the first merchant', async () => {
    insertTestRows(ctx.db, [
      categorized('A 1', 'Coffee', { merchantKey: 'A' }),
      categorized('B 1', 'Gas', { merchantKey: 'B' }),
      { description: 'A 2', merchantKey: 'A', date: '2026-10-02' },
      { description: 'B 2', merchantKey: 'B', date: '2026-10-03' },
    ]);
    const page1 = await list('category=none&sort=date&order=asc&pageSize=1');
    const page2 = await list('category=none&sort=date&order=asc&pageSize=1&page=2');
    expect(page1.total).toBe(2);
    expect(page1.items.map((t) => [t.description, t.suggestedCategoryId])).toEqual([
      ['A 2', id('Coffee')],
    ]);
    expect(page2.items.map((t) => [t.description, t.suggestedCategoryId])).toEqual([
      ['B 2', id('Gas')],
    ]);
  });

  it('is left out of lists that are not category=none', async () => {
    insertTestRows(ctx.db, [{ description: 'A' }, categorized('B', 'Gas')]);
    const { items } = await list('pageSize=500');
    expect(items).toHaveLength(2);
    for (const item of items) expect(item).not.toHaveProperty('suggestedCategoryId');
  });
});

describe('accepting a suggestion', () => {
  it('records category_source = suggestion', async () => {
    const rowId =
      insertTestRows(ctx.db, [
        categorized('SAFEWAY 1', 'Groceries', { merchantKey: 'SAFEWAY' }),
        { description: 'SAFEWAY 2', merchantKey: 'SAFEWAY' },
      ])[1] ?? 0;
    const suggested = (await uncategorized()).get('SAFEWAY 2')?.suggestedCategoryId;
    expect(suggested).toBe(id('Groceries'));

    const res = await ctx.app.request(`/api/transactions/${String(rowId)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ categoryId: suggested, categorySource: 'suggestion' }),
    });
    expect(res.status).toBe(200);
    expect(updateTransactionResponseSchema.parse(await res.json())).toMatchObject({
      categoryId: id('Groceries'),
      categorySource: 'suggestion',
    });
    expect(getTestRow(ctx.db, rowId)).toMatchObject({ categorySource: 'suggestion' });
    expect((await uncategorized()).size).toBe(0);
  });

  it('records category_source = suggestion for a whole merchant group in bulk', async () => {
    const ids = insertTestRows(ctx.db, [
      categorized('UBER 0', 'Transportation (Other)', { merchantKey: 'UBER' }),
      { description: 'UBER 1', merchantKey: 'UBER' },
      { description: 'UBER 2', merchantKey: 'UBER' },
    ]).slice(1);
    const res = await ctx.app.request('/api/transactions/bulk', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ids,
        patch: { categoryId: id('Transportation (Other)'), categorySource: 'suggestion' },
      }),
    });
    expect(res.status).toBe(200);
    expect(ids.map((rowId) => getTestRow(ctx.db, rowId).categorySource)).toEqual([
      'suggestion',
      'suggestion',
    ]);
  });
});
