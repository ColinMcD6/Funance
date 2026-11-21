import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  apiErrorSchema,
  changedCountResponseSchema,
  createRuleResponseSchema,
  deleteRuleResponseSchema,
  importPreviewResponseSchema,
  ruleListResponseSchema,
  testRuleResponseSchema,
  updateRuleResponseSchema,
  type RuleInput,
} from '@funance/shared';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { categories, rules, transactions } from '../db/schema.js';
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

function groceries(): number {
  return categoryIdByName(ctx.db, 'Groceries');
}

function costcoRule(overrides: Partial<RuleInput> = {}): RuleInput {
  return {
    priority: 100,
    matchField: 'description',
    matchType: 'contains',
    pattern: 'COSTCO',
    setCategoryId: groceries(),
    ...overrides,
  };
}

async function create(input: RuleInput) {
  const res = await send('POST', '/rules', input);
  expect(res.status).toBe(201);
  return createRuleResponseSchema.parse(await res.json());
}

async function listRules() {
  const res = await ctx.app.request('/api/rules');
  expect(res.status).toBe(200);
  return ruleListResponseSchema.parse(await res.json());
}

async function apply(): Promise<number> {
  const res = await send('POST', '/rules/apply');
  expect(res.status).toBe(200);
  return changedCountResponseSchema.parse(await res.json()).changed;
}

describe('GET /api/rules', () => {
  it('lists the three seeded card-payment rules in priority order', async () => {
    const list = await listRules();
    expect(list.map((r) => [r.priority, r.pattern])).toEqual([
      [10, 'PAYMENT - THANK YOU'],
      [20, 'PAYMENT THANK YOU'],
      [30, 'Credit Card Payment'],
    ]);
  });

  it('orders by priority, then id', async () => {
    const b = await create(costcoRule({ priority: 5, pattern: 'b' }));
    const a = await create(costcoRule({ priority: 5, pattern: 'a' }));
    const ids = (await listRules()).map((r) => r.id);
    expect(ids.slice(0, 2)).toEqual([b.id, a.id]);
  });
});

describe('POST /api/rules', () => {
  it('creates a rule with defaults for the optional fields', async () => {
    const rule = await create(costcoRule());
    expect(rule).toMatchObject({
      priority: 100,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'COSTCO',
      accountId: null,
      direction: null,
      setCategoryId: groceries(),
      setOwnerId: null,
      enabled: true,
      createdAt: TEST_NOW,
    });
    expect((await listRules()).map((r) => r.id)).toContain(rule.id);
  });

  it('saves every limit and the owner', async () => {
    const rule = await create(
      costcoRule({ accountId: 2, direction: 'outflow', setOwnerId: 3, enabled: false }),
    );
    expect(rule).toMatchObject({
      accountId: 2,
      direction: 'outflow',
      setOwnerId: 3,
      enabled: false,
    });
  });

  it('rejects an invalid regex with 400 at save', async () => {
    const res = await send(
      'POST',
      '/rules',
      costcoRule({ matchType: 'regex', pattern: '(COSTCO' }),
    );
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe('invalid_pattern');
    expect(error.message).toMatch(/Invalid pattern/);
    expect(await listRules()).toHaveLength(3);
  });

  it('accepts a valid regex', async () => {
    await create(costcoRule({ matchType: 'regex', pattern: '^COSTCO\\s+(WHOLESALE|GAS)' }));
  });

  it.each([
    ['category', { setCategoryId: 999 }],
    ['account', { accountId: 999 }],
    ['owner', { setOwnerId: 999 }],
  ])('rejects an unknown %s with 400', async (_what, overrides) => {
    const res = await send('POST', '/rules', costcoRule(overrides));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('invalid_reference');
  });

  it('rejects an archived category with 400', async () => {
    await send('DELETE', `/categories/${groceries()}`);
    const res = await send('POST', '/rules', costcoRule());
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('archived_category');
  });

  it.each([
    ['an empty pattern', { pattern: '' }],
    ['an unknown match type', { matchType: 'fuzzy' }],
    ['an unknown field', { matchField: 'notes' }],
    ['a missing priority', { priority: undefined }],
  ])('rejects %s with 400', async (_what, overrides) => {
    const res = await send('POST', '/rules', { ...costcoRule(), ...overrides });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('validation_error');
  });

  it('rejects a body that is not JSON', async () => {
    const res = await send('POST', '/rules', 'not json');
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('invalid_json');
  });
});

describe('PATCH /api/rules/:id', () => {
  it('edits fields, reorders by priority, and disables', async () => {
    const rule = await create(costcoRule());
    const res = await send('PATCH', `/rules/${rule.id}`, {
      priority: 1,
      pattern: 'costco wholesale',
      enabled: false,
    });
    expect(res.status).toBe(200);
    expect(updateRuleResponseSchema.parse(await res.json())).toMatchObject({
      id: rule.id,
      priority: 1,
      pattern: 'costco wholesale',
      enabled: false,
    });
    expect((await listRules())[0]?.id).toBe(rule.id);
  });

  it('checks the edited rule as a whole: switching to regex validates the existing pattern', async () => {
    const rule = await create(costcoRule({ pattern: '(COSTCO' }));
    const res = await send('PATCH', `/rules/${rule.id}`, { matchType: 'regex' });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('invalid_pattern');
  });

  it('answers 404 for a missing rule and 400 for an unknown category', async () => {
    expect((await send('PATCH', '/rules/999', { enabled: false })).status).toBe(404);
    const rule = await create(costcoRule());
    const res = await send('PATCH', `/rules/${rule.id}`, { setCategoryId: 999 });
    expect(res.status).toBe(400);
  });

  it('does not re-enable a rule whose category is archived', async () => {
    const rule = await create(costcoRule());
    await send('DELETE', `/categories/${groceries()}`);
    const res = await send('PATCH', `/rules/${rule.id}`, { enabled: true });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('archived_category');
    // A disabled rule pointing at it can still be edited otherwise.
    expect((await send('PATCH', `/rules/${rule.id}`, { pattern: 'COSTCO W' })).status).toBe(200);
  });
});

describe('DELETE /api/rules/:id', () => {
  it('deletes the rule; rows it categorized keep their category but lose the rule id', async () => {
    const rule = await create(costcoRule());
    const [id] = insertTestRows(ctx.db, [{ description: 'COSTCO WHOLESALE' }]);
    expect(await apply()).toBe(1);
    const res = await send('DELETE', `/rules/${rule.id}`);
    expect(res.status).toBe(200);
    expect(deleteRuleResponseSchema.parse(await res.json())).toEqual({ deletedId: rule.id });
    expect((await listRules()).map((r) => r.id)).not.toContain(rule.id);
    expect(getTestRow(ctx.db, id ?? 0)).toMatchObject({
      categoryId: groceries(),
      categorySource: 'rule',
      ruleId: null,
    });
  });

  it('answers 404 for a missing rule', async () => {
    expect((await send('DELETE', '/rules/999')).status).toBe(404);
  });
});

describe('POST /api/rules/test', () => {
  it('counts every match and returns the newest ten as samples', async () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({
      description: `Costco Wholesale #${i}`,
      date: `2026-10-${String(i + 1).padStart(2, '0')}`,
    }));
    insertTestRows(ctx.db, [...rows, { description: 'Safeway' }]);
    const res = await send('POST', '/rules/test', costcoRule());
    expect(res.status).toBe(200);
    const body = testRuleResponseSchema.parse(await res.json());
    expect(body.matchCount).toBe(12);
    expect(body.samples).toHaveLength(10);
    expect(body.samples[0]?.description).toBe('Costco Wholesale #11');
    expect(body.samples.map((t) => t.date)).toEqual(
      [...body.samples.map((t) => t.date)].sort().reverse(),
    );
  });

  it('respects the account and direction limits and counts manual rows too', async () => {
    insertTestRows(ctx.db, [
      { description: 'COSTCO', accountId: 1 },
      { description: 'COSTCO', accountId: 2 },
      { description: 'COSTCO refund', accountId: 2, amountCents: 500 },
      { description: 'COSTCO', accountId: 2, categoryId: groceries(), categorySource: 'manual' },
    ]);
    const test = async (overrides: Partial<RuleInput>) =>
      testRuleResponseSchema.parse(
        await (await send('POST', '/rules/test', costcoRule(overrides))).json(),
      ).matchCount;
    expect(await test({})).toBe(4);
    expect(await test({ accountId: 2 })).toBe(3);
    expect(await test({ accountId: 2, direction: 'outflow' })).toBe(2);
    expect(await test({ direction: 'inflow' })).toBe(1);
  });

  it('tests a disabled draft, and saves nothing', async () => {
    insertTestRows(ctx.db, [{ description: 'COSTCO' }]);
    const res = await send('POST', '/rules/test', costcoRule({ enabled: false }));
    expect(testRuleResponseSchema.parse(await res.json()).matchCount).toBe(1);
    expect(await listRules()).toHaveLength(3);
  });

  it('returns zero and no samples when nothing matches', async () => {
    const res = await send('POST', '/rules/test', costcoRule());
    expect(testRuleResponseSchema.parse(await res.json())).toEqual({ matchCount: 0, samples: [] });
  });

  it('rejects an invalid regex with 400', async () => {
    const res = await send('POST', '/rules/test', costcoRule({ matchType: 'regex', pattern: '[' }));
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('invalid_pattern');
  });
});

describe('POST /api/rules/apply', () => {
  it('categorizes uncategorized rows, recording the rule, and returns how many changed', async () => {
    const rule = await create(costcoRule({ setOwnerId: 3 }));
    const [costco, other] = insertTestRows(ctx.db, [
      { description: 'COSTCO WHOLESALE', ownerId: 1 },
      { description: 'Safeway' },
    ]);
    expect(await apply()).toBe(1);
    expect(getTestRow(ctx.db, costco ?? 0)).toMatchObject({
      categoryId: groceries(),
      categorySource: 'rule',
      ruleId: rule.id,
      ownerId: 3,
      updatedAt: TEST_NOW,
    });
    expect(getTestRow(ctx.db, other ?? 0)).toMatchObject({
      categoryId: null,
      categorySource: null,
    });
    // A second run changes nothing.
    expect(await apply()).toBe(0);
  });

  it('never changes a transaction whose category_source is manual', async () => {
    await create(costcoRule({ priority: 1 }));
    const home = categoryIdByName(ctx.db, 'Home');
    const [manual, suggestion] = insertTestRows(ctx.db, [
      { description: 'COSTCO', categoryId: home, categorySource: 'manual' },
      { description: 'COSTCO', categoryId: home, categorySource: 'suggestion' },
    ]);
    expect(await apply()).toBe(0);
    expect(getTestRow(ctx.db, manual ?? 0)).toMatchObject({
      categoryId: home,
      categorySource: 'manual',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    expect(getTestRow(ctx.db, suggestion ?? 0)).toMatchObject({
      categoryId: home,
      categorySource: 'suggestion',
    });
  });

  it('re-runs over rule-categorized rows: a higher-priority rule takes them over', async () => {
    const low = await create(costcoRule({ priority: 100 }));
    const [id] = insertTestRows(ctx.db, [{ description: 'COSTCO GAS' }]);
    expect(await apply()).toBe(1);
    expect(getTestRow(ctx.db, id ?? 0).ruleId).toBe(low.id);
    const gas = categoryIdByName(ctx.db, 'Gas');
    const high = await create(
      costcoRule({ priority: 50, pattern: 'COSTCO GAS', setCategoryId: gas }),
    );
    expect(await apply()).toBe(1);
    expect(getTestRow(ctx.db, id ?? 0)).toMatchObject({ categoryId: gas, ruleId: high.id });
  });

  it('leaves rows that no rule matches as they are, and ignores disabled rules', async () => {
    const rule = await create(costcoRule());
    const [id] = insertTestRows(ctx.db, [{ description: 'COSTCO' }]);
    await apply();
    await send('PATCH', `/rules/${rule.id}`, { enabled: false });
    expect(await apply()).toBe(0);
    expect(getTestRow(ctx.db, id ?? 0)).toMatchObject({ categoryId: groceries(), ruleId: rule.id });
    insertTestRows(ctx.db, [{ description: 'COSTCO again' }]);
    expect(await apply()).toBe(0);
  });

  it('applies the seeded card-payment rules to rows of any account, including legacy rows', async () => {
    const cardPayment = categoryIdByName(ctx.db, 'Card Payment');
    const ids = insertTestRows(ctx.db, [
      { description: 'PAYMENT - THANK YOU', accountId: 2, amountCents: 150000 },
      { description: 'PAYMENT THANK YOU/PAIEMEN T MERCI', accountId: 3, amountCents: 40000 },
      { description: 'Credit Card Payment - Tangerine', accountId: null },
    ]);
    expect(await apply()).toBe(3);
    for (const id of ids) expect(getTestRow(ctx.db, id).categoryId).toBe(cardPayment);
  });
});

describe('import uses the rules', () => {
  const fixture = (name: string) =>
    new Uint8Array(readFileSync(resolve(import.meta.dirname, '../../../../fixtures/csv', name)));

  async function previewMastercard() {
    const form = new FormData();
    form.set('file', new Blob([fixture('tangerine-mastercard-2026-10.csv')]), 'mc.csv');
    form.set('accountId', '2');
    const res = await ctx.app.request('/api/imports/preview', {
      method: 'POST',
      body: form,
      headers: { Cookie: 'profile=1' },
    });
    expect(res.status).toBe(201);
    return importPreviewResponseSchema.parse(await res.json());
  }

  it('preview shows the category a rule would assign, and commit records it', async () => {
    const rule = await create(costcoRule({ priority: 1, setOwnerId: 2 }));
    const preview = await previewMastercard();
    const costco = preview.rows.filter((r) => r.description?.includes('COSTCO'));
    expect(costco.length).toBeGreaterThan(0);
    for (const row of costco) {
      expect(row).toMatchObject({ categoryId: groceries(), ruleId: rule.id, ownerId: 2 });
    }
    const payment = preview.rows.find((r) => r.description === 'PAYMENT - THANK YOU');
    expect(payment?.categoryId).toBe(categoryIdByName(ctx.db, 'Card Payment'));

    const res = await ctx.app.request(`/api/imports/${preview.import.id}/commit`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const stored = ctx.db.select().from(transactions).where(eq(transactions.ruleId, rule.id)).all();
    expect(stored).toHaveLength(costco.length);
    for (const t of stored) {
      expect(t).toMatchObject({ categoryId: groceries(), categorySource: 'rule', ownerId: 2 });
    }
  });

  it('ignores disabled rules and rules whose category is archived', async () => {
    await create(costcoRule({ priority: 1, enabled: false }));
    const home = categoryIdByName(ctx.db, 'Home');
    await create(costcoRule({ priority: 2, setCategoryId: home }));
    // Archive Home directly, bypassing the API that would also disable the rule.
    ctx.db.update(categories).set({ archived: true }).where(eq(categories.id, home)).run();
    const enabled = ctx.db.select().from(rules).where(eq(rules.setCategoryId, home)).get();
    expect(enabled?.enabled).toBe(true);
    const preview = await previewMastercard();
    const costco = preview.rows.filter((r) => r.description?.includes('COSTCO'));
    for (const row of costco) expect(row.categoryId).toBeNull();
  });
});
