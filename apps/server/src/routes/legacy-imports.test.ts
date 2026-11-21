import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  accountListResponseSchema,
  apiErrorSchema,
  commitImportResponseSchema,
  importPreviewResponseSchema,
  legacyPreviewResponseSchema,
  undoImportResponseSchema,
} from '@funance/shared';
import { asc, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { categories, imports, owners, transactions } from '../db/schema.js';
import { makeTempDir } from '../db/test-db.js';
import { commitImport } from '../services/imports.js';
import { noopRuleEngine } from '../services/rule-engine.js';
import { makeTestApp, TEST_NOW } from '../test-app.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const fixture = (path: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(resolve(FIXTURES, path)));
const VALID = 'legacy/legacy-valid.xlsx';
const INVALID = 'legacy/legacy-invalid.xlsx';

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

/** Colin's profile cookie. */
const PROFILE = { Cookie: 'profile=1' };

function uploadLegacy(
  content: Uint8Array<ArrayBuffer>,
  filename = 'Expense-Monthly-Data.xlsx',
  headers: Record<string, string> = PROFILE,
) {
  const form = new FormData();
  form.set('file', new File([content], filename));
  return ctx.app.request('/api/imports/legacy/preview', { method: 'POST', body: form, headers });
}

async function previewLegacy(path = VALID) {
  const res = await uploadLegacy(fixture(path));
  expect(res.status).toBe(201);
  return legacyPreviewResponseSchema.parse(await res.json());
}

function commitRequest(id: number, body?: unknown) {
  return ctx.app.request(`/api/imports/${id}/commit`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

async function commit(id: number) {
  const res = await commitRequest(id);
  expect(res.status).toBe(200);
  return commitImportResponseSchema.parse(await res.json());
}

async function errorOf(res: Response) {
  return apiErrorSchema.parse(await res.json()).error;
}

const legacyRows = () =>
  ctx.db.select().from(transactions).where(isNull(transactions.accountId)).all();

describe('POST /api/imports/legacy/preview', () => {
  it('previews the valid workbook: every row new, per-month totals, no violations', async () => {
    const result = await previewLegacy();
    expect(result.import).toMatchObject({
      kind: 'legacy',
      accountId: null,
      status: 'preview',
      filename: 'Expense-Monthly-Data.xlsx',
      uploadedByOwnerId: 1,
      rowCount: 60,
      insertedCount: 60,
      duplicateCount: 0,
      skippedCount: 0,
      errorCount: 0,
      dateMin: '2026-07-01',
      dateMax: '2026-09-27',
      createdAt: TEST_NOW,
    });
    expect(result.violations).toEqual([]);
    expect(result.rows).toHaveLength(60);
    expect(result.rows.every((r) => r.status === 'new' && r.categoryId !== null)).toBe(true);
    expect(result.monthTotals.map((m) => [m.month, m.count])).toEqual([
      ['2026-07', 20],
      ['2026-08', 20],
      ['2026-09', 20],
    ]);
    expect(result.legacyOverlapMonths).toEqual([]);
    expect(ctx.db.select().from(transactions).all()).toHaveLength(0);
  });

  it('looks up categories and owners by name in the database', async () => {
    const result = await previewLegacy();
    const income = ctx.db.select().from(categories).where(eq(categories.name, 'Income')).get();
    const colin = ctx.db.select().from(owners).where(eq(owners.name, 'Colin')).get();
    expect(result.rows.find((r) => r.description === 'Paycheque Northwind Mfg')).toMatchObject({
      amountCents: 210000,
      categoryId: income?.id,
      ownerId: colin?.id,
    });
  });

  it('lists every violation of the invalid workbook with sheet, row, column and rule', async () => {
    const result = await previewLegacy(INVALID);
    expect(result.violations).toHaveLength(20);
    expect(result.violations[1]).toMatchObject({
      sheet: '07-2026',
      row: 1,
      column: 'D',
      rule: 'header',
    });
    expect(result.import.errorCount).toBe(16);
    expect(result.rows.filter((r) => r.status === 'error').every((r) => r.reason !== null)).toBe(
      true,
    );
  });

  it('reports an unreadable workbook as a file-format violation', async () => {
    const res = await uploadLegacy(new TextEncoder().encode('not a zip'));
    expect(res.status).toBe(201);
    const result = legacyPreviewResponseSchema.parse(await res.json());
    expect(result.violations.map((v) => v.rule)).toEqual(['file-format']);
    expect((await commitRequest(result.import.id)).status).toBe(409);
  });

  it('answers 400 for a file that is not named .xlsx', async () => {
    const res = await uploadLegacy(fixture(VALID), 'Expense-Monthly-Data.xls');
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('not_xlsx');
  });

  it('answers 401 without a profile', async () => {
    const res = await uploadLegacy(fixture(VALID), 'x.xlsx', {});
    expect(res.status).toBe(401);
  });

  it('answers 409 while a legacy import is committed, and accepts one again after undo', async () => {
    const first = await previewLegacy();
    await commit(first.import.id);
    const res = await uploadLegacy(fixture(VALID));
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('legacy_already_committed');

    await ctx.app.request(`/api/imports/${first.import.id}/undo`, { method: 'POST' });
    const again = await previewLegacy();
    expect(again.sameFileImportIds).toEqual([]);
    await commit(again.import.id);
    expect(legacyRows()).toHaveLength(60);
  });
});

describe('POST /api/imports/:id/commit (legacy)', () => {
  it('inserts every row with no account, category_source manual and the sheet totals', async () => {
    const previewed = await previewLegacy();
    const committed = await commit(previewed.import.id);
    expect(committed).toMatchObject({
      kind: 'legacy',
      status: 'committed',
      insertedCount: 60,
      committedAt: TEST_NOW,
    });

    const rows = ctx.db.select().from(transactions).orderBy(asc(transactions.id)).all();
    expect(rows).toHaveLength(60);
    for (const row of rows) {
      expect(row).toMatchObject({
        accountId: null,
        importId: previewed.import.id,
        categorySource: 'manual',
        ruleId: null,
        excluded: false,
      });
      expect(row.categoryId).not.toBeNull();
    }

    const month = sql<string>`substr(${transactions.date}, 1, 7)`;
    const totals = ctx.db
      .select({ month, cents: sql<number>`sum(${transactions.amountCents})` })
      .from(transactions)
      .groupBy(month)
      .orderBy(month)
      .all();
    expect(totals).toEqual(
      previewed.monthTotals.map((m) => ({ month: m.month, cents: -m.sheetTotalCents })),
    );

    // The two identical Tim Hortons rows are both kept, numbered 1 and 2.
    const tims = rows.filter((r) => r.description === 'Tim Hortons');
    expect(tims.map((r) => r.occurrence)).toEqual([1, 2]);
  });

  it('undo removes every legacy row', async () => {
    const previewed = await previewLegacy();
    await commit(previewed.import.id);
    const res = await ctx.app.request(`/api/imports/${previewed.import.id}/undo`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    expect(undoImportResponseSchema.parse(await res.json()).status).toBe('undone');
    expect(ctx.db.select().from(transactions).all()).toHaveLength(0);
  });

  it('answers 409 for a preview with violations and inserts nothing', async () => {
    const previewed = await previewLegacy(INVALID);
    const res = await commitRequest(previewed.import.id);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('legacy_has_errors');
    expect(ctx.db.select().from(transactions).all()).toHaveLength(0);
    const stored = ctx.db.select().from(imports).where(eq(imports.id, previewed.import.id)).get();
    expect(stored?.status).toBe('preview');
  });

  it('answers 409 for a second legacy commit', async () => {
    const first = await previewLegacy();
    const second = await previewLegacy();
    await commit(first.import.id);
    const res = await commitRequest(second.import.id);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('legacy_already_committed');
    expect(legacyRows()).toHaveLength(60);
  });

  it('answers 409 when committing the same legacy import twice', async () => {
    const previewed = await previewLegacy();
    await commit(previewed.import.id);
    const res = await commitRequest(previewed.import.id);
    expect(res.status).toBe(409);
    expect((await errorOf(res)).code).toBe('not_a_preview');
  });

  it('answers 400 when lines are left out of a legacy import', async () => {
    const previewed = await previewLegacy();
    const res = await commitRequest(previewed.import.id, { skipLines: [2] });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('skip_lines_not_supported');
  });
});

describe('legacy rows and CSV imports', () => {
  async function tangerineChequingId(): Promise<number> {
    const accounts = accountListResponseSchema.parse(
      await (await ctx.app.request('/api/accounts')).json(),
    );
    const account = accounts.find((a) => a.name === 'Tangerine Chequing');
    if (account === undefined) throw new Error('No Tangerine Chequing account');
    return account.id;
  }

  it('the CSV commit service rejects an import without an account with 400', async () => {
    const previewed = await previewLegacy();
    expect(() =>
      commitImport(ctx.db, () => TEST_NOW, noopRuleEngine, previewed.import.id, []),
    ).toThrow(expect.objectContaining({ status: 400, code: 'no_account' }));
    // A CSV preview without an account is a 400 too.
    const form = new FormData();
    form.set('file', new File([fixture('csv/tangerine-chequing-2026-09.csv')], 'a.csv'));
    const res = await ctx.app.request('/api/imports/preview', {
      method: 'POST',
      body: form,
      headers: PROFILE,
    });
    expect(res.status).toBe(400);
  });

  it('a CSV row equal to a legacy row is still new and is inserted, with the overlap note', async () => {
    const legacy = await previewLegacy();
    await commit(legacy.import.id);
    const sobeys = legacyRows().find((r) => r.description.includes('SOBEYS'));
    expect(sobeys).toMatchObject({ date: '2026-09-01', amountCents: -6778 });

    const form = new FormData();
    form.set('file', new File([fixture('csv/tangerine-chequing-2026-09.csv')], 'sept.csv'));
    form.set('accountId', String(await tangerineChequingId()));
    const res = await ctx.app.request('/api/imports/preview', {
      method: 'POST',
      body: form,
      headers: PROFILE,
    });
    expect(res.status).toBe(201);
    const csv = importPreviewResponseSchema.parse(await res.json());
    expect(csv.legacyOverlapMonths).toEqual(['2026-09']);
    const match = csv.rows.find((r) => r.dedupKey === sobeys?.dedupKey);
    expect(match).toMatchObject({ status: 'new', date: '2026-09-01', amountCents: -6778 });

    await commit(csv.import.id);
    const same = ctx.db
      .select()
      .from(transactions)
      .where(eq(transactions.dedupKey, sobeys?.dedupKey ?? ''))
      .all();
    expect(same.map((r) => r.accountId === null)).toEqual([true, false]);
  });
});
