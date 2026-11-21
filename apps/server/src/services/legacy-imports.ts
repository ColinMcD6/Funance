import { createHash } from 'node:crypto';
import {
  parseLegacyWorkbook,
  type LegacyCategory,
  type LegacyOwner,
  type LegacyRow,
  type LegacyWorkbook,
} from '@funance/core';
import type { ImportSummary, LegacyPreviewResponse, PreviewRow } from '@funance/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { categories, imports, owners, transactions } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';
import { MAX_IMPORT_BYTES, requireSummary } from './imports.js';
import type { DbOrTx } from './rule-engine.js';

// PLAN.md section 2, "Legacy spreadsheet import", and milestone ML. The old workbook is
// previewed, committed and undone like a CSV import, as one `imports` row with kind `legacy` and
// no account. The workbook is stored base64-encoded in `raw_csv`, and commit parses it again
// with the categories and owners as they are at commit time.

/**
 * The names a workbook row may use: active categories other than `transfer` ones (the sheet
 * never had Card Payment or Transfer), and every owner.
 */
function lookups(db: DbOrTx): { categories: LegacyCategory[]; owners: LegacyOwner[] } {
  return {
    categories: db
      .select({ id: categories.id, name: categories.name, kind: categories.kind })
      .from(categories)
      .where(and(eq(categories.archived, false), ne(categories.kind, 'transfer')))
      .all(),
    owners: db.select({ id: owners.id, name: owners.name }).from(owners).all(),
  };
}

async function parseStored(db: Db, base64: string): Promise<LegacyWorkbook> {
  const { categories: cats, owners: people } = lookups(db);
  return parseLegacyWorkbook(new Uint8Array(Buffer.from(base64, 'base64')), cats, people);
}

/** 409 when a legacy import is already committed: only one may be at a time. */
function requireNoCommittedLegacy(db: DbOrTx): void {
  const committed = db
    .select({ id: imports.id })
    .from(imports)
    .where(and(eq(imports.kind, 'legacy'), eq(imports.status, 'committed')))
    .get();
  if (committed !== undefined) {
    throw new HttpError(
      409,
      'legacy_already_committed',
      `The legacy spreadsheet is already imported (import #${committed.id}). Undo that import ` +
        'in Import history before importing it again.',
      { importId: committed.id },
    );
  }
}

function counts(rows: readonly LegacyRow[]) {
  const dates = rows.flatMap((r) => (r.status === 'parsed' ? [r.date] : [])).sort();
  return {
    rowCount: rows.length,
    insertedCount: rows.filter((r) => r.status === 'parsed').length,
    duplicateCount: 0,
    skippedCount: 0,
    errorCount: rows.filter((r) => r.status === 'error').length,
    dateMin: dates[0] ?? null,
    dateMax: dates.at(-1) ?? null,
  };
}

function toPreviewRow(row: LegacyRow): PreviewRow {
  const base = {
    line: row.line,
    postedDate: null,
    memo: null,
    bankCategory: null,
    externalId: null,
    ruleId: null,
    raw: row.raw,
  };
  if (row.status === 'error') {
    return {
      ...base,
      status: 'error',
      reason: row.reason,
      date: null,
      amountCents: null,
      description: null,
      merchantKey: null,
      dedupKey: null,
      occurrence: null,
      ownerId: null,
      categoryId: null,
    };
  }
  return {
    ...base,
    status: 'new',
    reason: null,
    date: row.date,
    amountCents: row.amountCents,
    description: row.description,
    merchantKey: row.merchantKey,
    dedupKey: row.dedupKey,
    occurrence: row.occurrence,
    ownerId: row.ownerId,
    categoryId: row.categoryId,
  };
}

export type LegacyPreviewInput = {
  filename: string;
  content: Uint8Array;
  uploadedByOwnerId: number;
};

/**
 * POST /imports/legacy/preview. Checks the workbook against the format specification and stores
 * an import of kind `legacy` in `preview`. Violations do not fail the request: they are listed so
 * the uploader can fix the workbook, and commit refuses while there are any. 409 while another
 * legacy import is committed.
 */
export async function previewLegacyImport(
  db: Db,
  clock: Clock,
  input: LegacyPreviewInput,
): Promise<LegacyPreviewResponse> {
  const { content, filename } = input;
  if (!filename.toLowerCase().endsWith('.xlsx')) {
    throw new HttpError(
      400,
      'not_xlsx',
      'Choose the workbook saved as .xlsx (not .xls, .xlsm or .csv)',
    );
  }
  if (content.byteLength > MAX_IMPORT_BYTES) {
    throw new HttpError(
      400,
      'file_too_large',
      `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB`,
    );
  }
  requireNoCommittedLegacy(db);

  const { categories: cats, owners: people } = lookups(db);
  const workbook = await parseLegacyWorkbook(content, cats, people);
  const fileSha256 = createHash('sha256').update(content).digest('hex');

  return db.transaction((tx) => {
    requireNoCommittedLegacy(tx);
    const { id } = tx
      .insert(imports)
      .values({
        accountId: null,
        filename,
        fileSha256,
        rawCsv: Buffer.from(content).toString('base64'),
        status: 'preview',
        uploadedByOwnerId: input.uploadedByOwnerId,
        ...counts(workbook.rows),
        createdAt: clock(),
        kind: 'legacy',
      })
      .returning({ id: imports.id })
      .get();

    const sameFileImportIds = tx
      .select({ id: imports.id })
      .from(imports)
      .where(
        and(
          eq(imports.fileSha256, fileSha256),
          eq(imports.status, 'committed'),
          ne(imports.id, id),
        ),
      )
      .orderBy(imports.id)
      .all()
      .map((r) => r.id);

    return {
      import: requireSummary(tx, id),
      rows: workbook.rows.map(toPreviewRow),
      sameFileImportIds,
      legacyOverlapMonths: [],
      monthTotals: workbook.monthTotals,
      violations: workbook.violations,
    };
  });
}

/**
 * POST /imports/:id/commit for a legacy import. Parses the stored workbook again and, in one
 * database transaction, inserts every row with no account and `category_source = manual`.
 * 409 unless the import is a preview, while the workbook has violations, or while another legacy
 * import is committed. Leaving out single rows (`skipLines`) is a CSV feature: 400 here.
 */
export async function commitLegacyImport(
  db: Db,
  clock: Clock,
  id: number,
  skipLines: readonly number[],
): Promise<ImportSummary> {
  if (skipLines.length > 0) {
    throw new HttpError(
      400,
      'skip_lines_not_supported',
      'Rows of the legacy spreadsheet cannot be left out; fix the workbook instead',
    );
  }
  const stored = db.select().from(imports).where(eq(imports.id, id)).get();
  if (stored === undefined) throw notFound('Import', id);
  if (stored.status !== 'preview') {
    throw new HttpError(409, 'not_a_preview', `Import ${id} is already ${stored.status}`);
  }

  const workbook = await parseStored(db, stored.rawCsv);
  if (workbook.violations.length > 0) {
    throw new HttpError(
      409,
      'legacy_has_errors',
      `The workbook breaks ${workbook.violations.length} rule(s) of the format specification. ` +
        'Fix them and upload it again.',
      { violationCount: workbook.violations.length },
    );
  }

  return db.transaction((tx) => {
    const current = requireSummary(tx, id);
    if (current.status !== 'preview') {
      throw new HttpError(409, 'not_a_preview', `Import ${id} is already ${current.status}`);
    }
    requireNoCommittedLegacy(tx);
    const now = clock();
    for (const row of workbook.rows) {
      if (row.status !== 'parsed') continue;
      tx.insert(transactions)
        .values({
          accountId: null,
          importId: id,
          ownerId: row.ownerId,
          categoryId: row.categoryId,
          categorySource: 'manual',
          ruleId: null,
          date: row.date,
          postedDate: null,
          amountCents: row.amountCents,
          description: row.description,
          memo: null,
          merchantKey: row.merchantKey,
          bankCategory: null,
          externalId: null,
          dedupKey: row.dedupKey,
          occurrence: row.occurrence,
          notes: null,
          excluded: false,
          rawRow: row.raw,
          createdAt: now,
          updatedAt: now,
        })
        .run();
    }
    tx.update(imports)
      .set({ ...counts(workbook.rows), status: 'committed', committedAt: now })
      .where(eq(imports.id, id))
      .run();
    return requireSummary(tx, id);
  });
}
