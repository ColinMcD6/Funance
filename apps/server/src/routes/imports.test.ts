import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getCsvPreset } from '@funance/core';
import {
  accountListResponseSchema,
  apiErrorSchema,
  commitImportResponseSchema,
  importDetailResponseSchema,
  importListResponseSchema,
  importPreviewResponseSchema,
  undoImportResponseSchema,
  type CsvMapping,
} from '@funance/shared';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock.js';
import { categories, imports, transactions } from '../db/schema.js';
import { makeTempDir } from '../db/test-db.js';
import { deleteStalePreviews } from '../services/imports.js';
import type { RuleEngine } from '../services/rule-engine.js';
import { makeTestApp, TEST_NOW } from '../test-app.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures/csv');
const fixture = (name: string): Uint8Array<ArrayBuffer> =>
  new Uint8Array(readFileSync(resolve(FIXTURES, name)));
const text = (content: string): Uint8Array<ArrayBuffer> => new TextEncoder().encode(content);

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

async function accountId(name: string): Promise<number> {
  const accounts = accountListResponseSchema.parse(
    await (await ctx.app.request('/api/accounts')).json(),
  );
  const account = accounts.find((a) => a.name === name);
  if (account === undefined) throw new Error(`No account ${name}`);
  return account.id;
}

function upload(
  content: Uint8Array<ArrayBuffer> | null,
  fields: Record<string, string>,
  headers: Record<string, string> = PROFILE,
) {
  const form = new FormData();
  if (content !== null) form.set('file', new File([content], 'statement.csv'));
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return ctx.app.request('/api/imports/preview', { method: 'POST', body: form, headers });
}

async function preview(account: string, content: Uint8Array<ArrayBuffer>) {
  const res = await upload(content, { accountId: String(await accountId(account)) });
  expect(res.status).toBe(201);
  return importPreviewResponseSchema.parse(await res.json());
}

function commitRequest(id: number, body?: unknown) {
  return ctx.app.request(`/api/imports/${id}/commit`, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
}

async function commit(id: number, body?: unknown) {
  const res = await commitRequest(id, body);
  expect(res.status).toBe(200);
  return commitImportResponseSchema.parse(await res.json());
}

function undoRequest(id: number) {
  return ctx.app.request(`/api/imports/${id}/undo`, { method: 'POST' });
}

async function errorOf(res: Response) {
  return apiErrorSchema.parse(await res.json()).error;
}

function storedRows(importId?: number) {
  const query = ctx.db.select().from(transactions);
  return (importId === undefined ? query : query.where(eq(transactions.importId, importId)))
    .orderBy(asc(transactions.id))
    .all();
}

const SEPTEMBER = 'tangerine-chequing-2026-09.csv';
const OVERLAP = 'tangerine-chequing-2026-10-overlap.csv';

/** A small Tangerine chequing file. */
function chequing(...rows: string[]): Uint8Array<ArrayBuffer> {
  return text(['Date,Transaction,Name,Memo,Amount', ...rows, ''].join('\n'));
}

describe('POST /api/imports/preview', () => {
  it('previews a file without inserting transactions', async () => {
    const result = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect(result.import).toMatchObject({
      status: 'preview',
      kind: 'csv',
      filename: 'statement.csv',
      uploadedByOwnerId: 1,
      rowCount: 40,
      insertedCount: 38,
      duplicateCount: 0,
      skippedCount: 2,
      errorCount: 0,
      createdAt: TEST_NOW,
      committedAt: null,
    });
    expect(result.import.dateMin).toMatch(/^2026-0[89]-\d\d$/);
    expect(result.rows).toHaveLength(40);
    expect(result.rows.filter((r) => r.status === 'skipped').map((r) => r.reason)).toEqual([
      'Zero amount',
      'Zero amount',
    ]);
    const newRow = result.rows.find((r) => r.status === 'new');
    expect(newRow).toMatchObject({ ownerId: 1, categoryId: null, ruleId: null, occurrence: 1 });
    expect(result.sameFileImportIds).toEqual([]);
    expect(result.legacyOverlapMonths).toEqual([]);
    expect(storedRows()).toHaveLength(0);
  });

  it('gives each row the owner from the account default', async () => {
    const result = await preview('Simplii Visa', fixture('simplii-visa-2026-10.csv'));
    const joint = 3;
    expect(new Set(result.rows.map((r) => r.ownerId))).toEqual(new Set([joint]));
  });

  it('reports bad rows as errors with reasons, and a blank line as skipped', async () => {
    const result = await preview('Tangerine Chequing', fixture('malformed.csv'));
    expect(result.import).toMatchObject({ insertedCount: 4, errorCount: 3, skippedCount: 1 });
    for (const row of result.rows.filter((r) => r.status === 'error')) {
      expect(row.reason).not.toBeNull();
      expect(row.amountCents).toBeNull();
    }
  });

  it('answers 400 naming the missing columns when the headers do not match the mapping', async () => {
    const res = await upload(fixture('wrong-headers.csv'), {
      accountId: String(await accountId('Tangerine Chequing')),
    });
    expect(res.status).toBe(400);
    const error = await errorOf(res);
    expect(error.code).toBe('missing_columns');
    expect(error.message).toContain('"Date", "Memo", "Amount"');
    expect(error.message).toContain('Tangerine Chequing');
    expect(error.details).toEqual({ missingColumns: ['Date', 'Memo', 'Amount'] });
    expect(ctx.db.select().from(imports).all()).toHaveLength(0);
  });

  it('answers 400 for a file with only a header', async () => {
    const res = await upload(chequing(), {
      accountId: String(await accountId('Tangerine Chequing')),
    });
    expect(res.status).toBe(400);
    expect((await errorOf(res)).code).toBe('empty_file');
  });

  it('answers 401 without a profile', async () => {
    const res = await upload(fixture(SEPTEMBER), { accountId: '1' }, {});
    expect(res.status).toBe(401);
    expect((await errorOf(res)).code).toBe('no_profile');
  });

  it('answers 400 without a file or with a bad account id', async () => {
    const noFile = await upload(null, { accountId: '1' });
    expect(noFile.status).toBe(400);
    expect((await errorOf(noFile)).code).toBe('validation_error');

    const badFields: Record<string, string>[] = [{}, { accountId: 'abc' }, { accountId: '0' }];
    for (const fields of badFields) {
      const res = await upload(fixture(SEPTEMBER), fields);
      expect(res.status).toBe(400);
      expect((await errorOf(res)).code).toBe('validation_error');
    }
  });

  it('answers 400 for a body that is not a form', async () => {
    const res = await ctx.app.request('/api/imports/preview', {
      method: 'POST',
      headers: { ...PROFILE, 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(res.status).toBe(400);
  });

  it('answers 404 for an unknown account and 409 for an archived one', async () => {
    const missing = await upload(fixture(SEPTEMBER), { accountId: '999' });
    expect(missing.status).toBe(404);

    const id = await accountId('Tangerine Chequing');
    await ctx.app.request(`/api/accounts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    const archived = await upload(fixture(SEPTEMBER), { accountId: String(id) });
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe('account_archived');
  });

  it('notes months of the file that already hold legacy rows', async () => {
    const legacy = ctx.db
      .insert(imports)
      .values({
        accountId: null,
        filename: 'legacy.xlsx',
        fileSha256: 'a'.repeat(64),
        rawCsv: '',
        status: 'committed',
        uploadedByOwnerId: 1,
        createdAt: TEST_NOW,
        kind: 'legacy',
      })
      .returning()
      .get();
    for (const date of ['2026-09-03', '2026-07-01']) {
      ctx.db
        .insert(transactions)
        .values({
          accountId: null,
          importId: legacy.id,
          ownerId: 1,
          date,
          amountCents: -100,
          description: 'Legacy row',
          merchantKey: 'LEGACY ROW',
          dedupKey: `legacy-${date}`,
          occurrence: 1,
          rawRow: {},
          createdAt: TEST_NOW,
          updatedAt: TEST_NOW,
        })
        .run();
    }
    const result = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect(result.legacyOverlapMonths).toEqual(['2026-09']);
  });
});

describe('POST /api/imports/:id/commit', () => {
  it('inserts the new rows with their parsed fields and records the final counts', async () => {
    const { import: previewed, rows } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    const committed = await commit(previewed.id);
    expect(committed).toMatchObject({
      id: previewed.id,
      status: 'committed',
      committedAt: TEST_NOW,
      rowCount: 40,
      insertedCount: 38,
      duplicateCount: 0,
      skippedCount: 2,
      errorCount: 0,
    });

    const stored = storedRows(previewed.id);
    const expected = rows.filter((r) => r.status === 'new');
    expect(stored).toHaveLength(38);
    expect(
      stored.map((t) => [t.date, t.amountCents, t.description, t.dedupKey, t.occurrence]),
    ).toEqual(
      expected.map((r) => [r.date, r.amountCents, r.description, r.dedupKey, r.occurrence]),
    );
    const account = await accountId('Tangerine Chequing');
    // The seeded "Credit Card Payment" rule (M6) categorizes the one card payment row.
    const cardPayment = ctx.db
      .select()
      .from(categories)
      .where(eq(categories.name, 'Card Payment'))
      .get();
    for (const t of stored) {
      const isCardPayment = t.description.startsWith('Credit Card Payment');
      expect(t).toMatchObject({
        accountId: account,
        ownerId: 1,
        categoryId: isCardPayment ? cardPayment?.id : null,
        categorySource: isCardPayment ? 'rule' : null,
        ruleId: isCardPayment ? 3 : null,
        excluded: false,
        notes: null,
        createdAt: TEST_NOW,
      });
    }
    expect(stored.filter((t) => t.categorySource === 'rule')).toHaveLength(1);
    expect(stored[0]?.rawRow).toEqual(expected[0]?.raw);
  });

  it('accepts a JSON body with no lines to skip', async () => {
    const { import: previewed } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect((await commit(previewed.id, {})).insertedCount).toBe(38);
  });

  it('a second preview of the same file shows every row as a duplicate and the same-file warning', async () => {
    const first = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    await commit(first.import.id);

    const second = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect(second.import).toMatchObject({ insertedCount: 0, duplicateCount: 38, skippedCount: 2 });
    expect(second.rows.filter((r) => r.status === 'new')).toHaveLength(0);
    expect(second.sameFileImportIds).toEqual([first.import.id]);

    expect((await commit(second.import.id)).insertedCount).toBe(0);
    expect(storedRows()).toHaveLength(38);
  });

  it('inserts only the new rows of an overlapping statement', async () => {
    await commit((await preview('Tangerine Chequing', fixture(SEPTEMBER))).import.id);
    const overlap = await preview('Tangerine Chequing', fixture(OVERLAP));
    expect(overlap.import).toMatchObject({
      insertedCount: 24,
      duplicateCount: 10,
      skippedCount: 1,
    });
    expect(overlap.sameFileImportIds).toEqual([]);

    const committed = await commit(overlap.import.id);
    expect(committed.insertedCount).toBe(24);
    expect(storedRows(overlap.import.id)).toHaveLength(24);
    expect(storedRows()).toHaveLength(62);
  });

  it('decides new and duplicate at commit time, not from a stale preview', async () => {
    const first = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    const second = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect(second.import.insertedCount).toBe(38);
    await commit(first.import.id);

    const committed = await commit(second.import.id);
    expect(committed).toMatchObject({ insertedCount: 0, duplicateCount: 38 });
    expect(storedRows()).toHaveLength(38);
  });

  it('leaves out unticked lines and counts them as skipped', async () => {
    const { import: previewed, rows } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    const newLines = rows.filter((r) => r.status === 'new').map((r) => r.line);
    const [first, second] = newLines;
    if (first === undefined || second === undefined) throw new Error('too few rows');
    const committed = await commit(previewed.id, { skipLines: [first, second, 9999] });
    expect(committed).toMatchObject({ insertedCount: 36, skippedCount: 4 });
    const lines = storedRows().map((t) => t.rawRow);
    expect(lines).not.toContainEqual(rows.find((r) => r.line === first)?.raw);
  });

  it('answers 409 when the import is already committed, and 404 when it does not exist', async () => {
    const { import: previewed } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    await commit(previewed.id);
    const again = await commitRequest(previewed.id);
    expect(again.status).toBe(409);
    expect((await errorOf(again)).code).toBe('not_a_preview');
    expect(storedRows()).toHaveLength(38);

    expect((await commitRequest(999)).status).toBe(404);
  });

  it('answers 400 for an invalid body or id', async () => {
    const { import: previewed } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect((await commitRequest(previewed.id, { skipLines: [0] })).status).toBe(400);
    expect((await commitRequest(previewed.id, { skipLines: 'all' })).status).toBe(400);
    expect((await commitRequest(0)).status).toBe(400);
    const notJson = await ctx.app.request(`/api/imports/${previewed.id}/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{',
    });
    expect(notJson.status).toBe(400);
    expect(storedRows()).toHaveLength(0);
  });

  it('numbers four identical rows against two stored ones as two duplicates and two new', async () => {
    const row = '10/05/2026,OTHER,UBER,Interac - Purchase - UBER TRIP,-12.00';
    await commit((await preview('Tangerine Chequing', chequing(row, row))).import.id);
    const result = await preview('Tangerine Chequing', chequing(row, row, row, row));
    expect(result.rows.map((r) => [r.status, r.occurrence])).toEqual([
      ['duplicate', 1],
      ['duplicate', 2],
      ['new', 3],
      ['new', 4],
    ]);
    await commit(result.import.id);
    expect(storedRows().map((t) => t.occurrence)).toEqual([1, 2, 3, 4]);
  });

  it('fills an occurrence number freed by an undo instead of colliding', async () => {
    const row = '10/05/2026,OTHER,UBER,Interac - Purchase - UBER TRIP,-12.00';
    const other = '10/06/2026,OTHER,SHELL,Interac - Purchase - SHELL,-40.00';
    const a = await preview('Tangerine Chequing', chequing(row));
    await commit(a.import.id);
    const b = await preview('Tangerine Chequing', chequing(row, row, other));
    await commit(b.import.id);
    expect((await undoRequest(a.import.id)).status).toBe(200);
    // The account now holds the row once, as occurrence 2.

    const c = await preview('Tangerine Chequing', chequing(row, row));
    expect(c.rows.map((r) => [r.status, r.occurrence])).toEqual([
      ['duplicate', 1],
      ['new', 1],
    ]);
    expect((await commit(c.import.id)).insertedCount).toBe(1);
    expect(
      storedRows()
        .filter((t) => t.description.includes('UBER'))
        .map((t) => t.occurrence)
        .sort(),
    ).toEqual([1, 2]);
  });

  it('reads a latin1 file the same way at preview and at commit', async () => {
    const mapping: CsvMapping = {
      ...structuredClone(getCsvPreset('tangerine-chequing').mapping),
      encoding: 'latin1',
    };
    const res = await ctx.app.request('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Latin chequing',
        institution: 'other',
        type: 'chequing',
        defaultOwnerId: 2,
        csvMapping: mapping,
      }),
    });
    expect(res.status).toBe(201);
    const bytes = Uint8Array.from(
      'Date,Transaction,Name,Memo,Amount\n10/05/2026,OTHER,CAFE,CAF\xC9 R\xC9MI,-4.50\n',
      (ch) => ch.charCodeAt(0),
    );
    const result = await preview('Latin chequing', bytes);
    expect(result.rows[0]?.description).toBe('CAFÉ RÉMI');
    await commit(result.import.id);
    expect(storedRows()[0]).toMatchObject({ description: 'CAFÉ RÉMI', ownerId: 2 });
  });
});

describe('rule engine hook', () => {
  it('shows rule categories in the preview and stores them at commit', async () => {
    ctx.close();
    const engine: RuleEngine = (db, candidates) => {
      const groceries = db.select().from(categories).where(eq(categories.name, 'Groceries')).get();
      if (groceries === undefined) throw new Error('no Groceries');
      return candidates.map((c) =>
        c.description.includes('SOBEYS')
          ? { categoryId: groceries.id, ruleId: 1, ownerId: 2 }
          : null,
      );
    };
    ctx = makeTestApp(temp.dir, { ruleEngine: engine });
    const sobeys = '10/01/2026,OTHER,SOBEYS,Interac - Purchase - SOBEYS 4567,-42.10';
    const shell = '10/02/2026,OTHER,SHELL,Interac - Purchase - SHELL,-40.00';
    const result = await preview('Tangerine Chequing', chequing(sobeys, shell));
    const [first, second] = result.rows;
    expect(first).toMatchObject({ ruleId: 1, ownerId: 2 });
    expect(first?.categoryId).not.toBeNull();
    expect(second).toMatchObject({ ruleId: null, categoryId: null, ownerId: 1 });

    await commit(result.import.id);
    const [stored, plain] = storedRows();
    expect(stored).toMatchObject({
      categoryId: first?.categoryId,
      categorySource: 'rule',
      ruleId: 1,
      ownerId: 2,
    });
    expect(plain).toMatchObject({ categoryId: null, categorySource: null, ownerId: 1 });
  });
});

describe('POST /api/imports/:id/undo', () => {
  it('removes exactly that import’s rows and marks it undone', async () => {
    const september = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    await commit(september.import.id);
    const overlap = await preview('Tangerine Chequing', fixture(OVERLAP));
    await commit(overlap.import.id);
    const septemberIds = storedRows(september.import.id).map((t) => t.id);

    const res = await undoRequest(overlap.import.id);
    expect(res.status).toBe(200);
    expect(undoImportResponseSchema.parse(await res.json())).toMatchObject({
      status: 'undone',
      undoneAt: TEST_NOW,
      insertedCount: 24,
    });
    expect(storedRows(overlap.import.id)).toHaveLength(0);
    expect(storedRows().map((t) => t.id)).toEqual(septemberIds);

    // Undone rows import again.
    const again = await preview('Tangerine Chequing', fixture(OVERLAP));
    expect(again.import.insertedCount).toBe(24);
  });

  it('answers 409 for a preview or an undone import, and 404 for an unknown one', async () => {
    const { import: previewed } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    expect((await undoRequest(previewed.id)).status).toBe(409);
    await commit(previewed.id);
    expect((await undoRequest(previewed.id)).status).toBe(200);
    const twice = await undoRequest(previewed.id);
    expect(twice.status).toBe(409);
    expect((await errorOf(twice)).code).toBe('not_committed');
    expect((await commitRequest(previewed.id)).status).toBe(409);
    expect((await undoRequest(999)).status).toBe(404);
  });
});

describe('GET /api/imports and /api/imports/:id', () => {
  it('lists imports newest first, without the file content', async () => {
    const first = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    const second = await preview('Simplii Visa', fixture('simplii-visa-2026-10.csv'));
    const res = await ctx.app.request('/api/imports');
    expect(res.status).toBe(200);
    const json = (await res.json()) as Record<string, unknown>[];
    expect(json[0]).not.toHaveProperty('rawCsv');
    expect(importListResponseSchema.parse(json).map((i) => i.id)).toEqual([
      second.import.id,
      first.import.id,
    ]);
  });

  it('counts the manually categorized rows that an undo would lose', async () => {
    const { import: previewed } = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    await commit(previewed.id);
    const [a, b] = storedRows(previewed.id);
    if (a === undefined || b === undefined) throw new Error('too few rows');
    ctx.db
      .update(transactions)
      .set({ categoryId: 1, categorySource: 'manual' })
      .where(eq(transactions.id, a.id))
      .run();
    ctx.db
      .update(transactions)
      .set({ categoryId: 1, categorySource: 'suggestion' })
      .where(eq(transactions.id, b.id))
      .run();

    const res = await ctx.app.request(`/api/imports/${previewed.id}`);
    expect(res.status).toBe(200);
    expect(importDetailResponseSchema.parse(await res.json())).toMatchObject({
      import: { id: previewed.id, status: 'committed' },
      manuallyCategorizedCount: 1,
    });
  });

  it('answers 404 for an unknown import and 400 for a bad id', async () => {
    expect((await ctx.app.request('/api/imports/999')).status).toBe(404);
    expect((await ctx.app.request('/api/imports/x')).status).toBe(400);
  });
});

describe('deleteStalePreviews', () => {
  it('deletes previews older than 24 hours and keeps everything else', async () => {
    const old = await preview('Tangerine Chequing', fixture(SEPTEMBER));
    const kept = await preview('Tangerine Chequing', fixture(OVERLAP));
    const committed = await preview('Simplii Visa', fixture('simplii-visa-2026-10.csv'));
    await commit(committed.import.id);
    const ages: [number, string][] = [
      [old.import.id, '2026-11-19T11:59:59.000Z'],
      [kept.import.id, '2026-11-19T12:00:01.000Z'],
      [committed.import.id, '2026-11-01T00:00:00.000Z'],
    ];
    for (const [id, createdAt] of ages) {
      ctx.db.update(imports).set({ createdAt }).where(eq(imports.id, id)).run();
    }

    expect(deleteStalePreviews(ctx.db, fixedClock(TEST_NOW))).toBe(1);
    const left = ctx.db
      .select({ id: imports.id })
      .from(imports)
      .orderBy(sql`${imports.id}`)
      .all()
      .map((r) => r.id);
    expect(left).toEqual([kept.import.id, committed.import.id]);
    expect(storedRows()).toHaveLength(15);
  });
});
