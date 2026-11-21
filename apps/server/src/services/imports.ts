import { createHash } from 'node:crypto';
import {
  assignOccurrences,
  decodeCsvBytes,
  missingCsvColumns,
  parseCsv,
  type AssignedOkRow,
  type AssignedRow,
  type ParsedRow,
} from '@funance/core';
import type {
  Account,
  ImportDetailResponse,
  ImportPreviewResponse,
  ImportSummary,
  PreviewRow,
} from '@funance/shared';
import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { accounts, imports, transactions } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';
import type { DbOrTx, RuleAssignment, RuleEngine } from './rule-engine.js';

// PLAN.md section 3, "Import", and milestone M4: preview, commit, undo, history.
//
// A preview stores the decoded file in `imports.raw_csv` and nothing else; commit parses it again
// with the account's current mapping and compares it with the account's transactions as they are
// at commit time, inside one database transaction. So a commit never inserts a row that another
// import committed in the meantime.

/** Largest accepted upload. Bank statements are a few kilobytes; this only stops accidents. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/** Previews older than this are deleted at server start. */
export const PREVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** The import columns an API response carries: everything but the raw file. */
const summaryColumns = {
  id: imports.id,
  accountId: imports.accountId,
  filename: imports.filename,
  fileSha256: imports.fileSha256,
  status: imports.status,
  uploadedByOwnerId: imports.uploadedByOwnerId,
  rowCount: imports.rowCount,
  insertedCount: imports.insertedCount,
  duplicateCount: imports.duplicateCount,
  skippedCount: imports.skippedCount,
  errorCount: imports.errorCount,
  dateMin: imports.dateMin,
  dateMax: imports.dateMax,
  createdAt: imports.createdAt,
  committedAt: imports.committedAt,
  undoneAt: imports.undoneAt,
  kind: imports.kind,
};

function findSummary(db: DbOrTx, id: number): ImportSummary | undefined {
  return db.select(summaryColumns).from(imports).where(eq(imports.id, id)).get();
}

function requireSummary(db: DbOrTx, id: number): ImportSummary {
  const summary = findSummary(db, id);
  if (summary === undefined) throw notFound('Import', id);
  return summary;
}

/** Every import, newest first, previews included. */
export function listImports(db: Db): ImportSummary[] {
  return db
    .select(summaryColumns)
    .from(imports)
    .orderBy(desc(imports.createdAt), desc(imports.id))
    .all();
}

/** One import and how many of its transactions were categorized by hand (lost on undo). */
export function getImportDetail(db: Db, id: number): ImportDetailResponse {
  const summary = requireSummary(db, id);
  const manual = db
    .select({ n: sql<number>`count(*)` })
    .from(transactions)
    .where(and(eq(transactions.importId, id), eq(transactions.categorySource, 'manual')))
    .get();
  return { import: summary, manuallyCategorizedCount: manual?.n ?? 0 };
}

/**
 * Parsed rows compared with the account's stored transactions (PLAN.md section 2, "Duplicate
 * detection"): `assignOccurrences` decides new or duplicate from the per-key counts. A new row then
 * takes the lowest occurrence number its key has free. Without gaps that is m+1, m+2, ..., as the
 * plan says; after an undo has left a gap (another import's rows of the same key remain), it fills
 * the gap instead of colliding with the unique (account, dedup key, occurrence) index.
 */
function compareWithAccount(db: DbOrTx, accountId: number, parsed: ParsedRow[]): AssignedRow[] {
  const keys = [...new Set(parsed.flatMap((r) => (r.status === 'parsed' ? [r.dedupKey] : [])))];
  const taken = new Map<string, Set<number>>();
  // Chunked to stay far below SQLite's limit on bound parameters.
  for (let i = 0; i < keys.length; i += 500) {
    const stored = db
      .select({ dedupKey: transactions.dedupKey, occurrence: transactions.occurrence })
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          inArray(transactions.dedupKey, keys.slice(i, i + 500)),
        ),
      )
      .all();
    for (const { dedupKey, occurrence } of stored) {
      const set = taken.get(dedupKey) ?? new Set<number>();
      set.add(occurrence);
      taken.set(dedupKey, set);
    }
  }
  const counts = new Map([...taken].map(([key, set]) => [key, set.size]));

  return assignOccurrences(parsed, counts).map((row) => {
    if (row.status !== 'new') return row;
    const used = taken.get(row.dedupKey) ?? new Set<number>();
    let occurrence = 1;
    while (used.has(occurrence)) occurrence += 1;
    used.add(occurrence);
    taken.set(row.dedupKey, used);
    return { ...row, occurrence };
  });
}

/** Parses the stored, already decoded file with the account's mapping. */
function parseStored(account: Account, rawCsv: string): ParsedRow[] {
  return parseCsv(
    new TextEncoder().encode(rawCsv),
    { ...account.csvMapping, encoding: 'utf-8' },
    { defaultOwnerId: account.defaultOwnerId },
  );
}

/** Rule assignments for the `new` rows, keyed by line. */
function categorizeNewRows(
  db: DbOrTx,
  engine: RuleEngine,
  accountId: number,
  rows: readonly AssignedRow[],
): Map<number, RuleAssignment> {
  const fresh = rows.filter((r): r is AssignedOkRow => r.status === 'new');
  const results = engine(
    db,
    fresh.map((r) => ({
      accountId,
      description: r.description,
      memo: r.memo,
      bankCategory: r.bankCategory,
      amountCents: r.amountCents,
    })),
  );
  const byLine = new Map<number, RuleAssignment>();
  fresh.forEach((row, i) => {
    const result = results[i];
    if (result != null) byLine.set(row.line, result);
  });
  return byLine;
}

type Counts = {
  rowCount: number;
  insertedCount: number;
  duplicateCount: number;
  skippedCount: number;
  errorCount: number;
  dateMin: string | null;
  dateMax: string | null;
};

function countRows(rows: readonly AssignedRow[]): Counts {
  const dates = rows.flatMap((r) =>
    r.status === 'new' || r.status === 'duplicate' ? [r.date] : [],
  );
  dates.sort();
  return {
    rowCount: rows.length,
    insertedCount: rows.filter((r) => r.status === 'new').length,
    duplicateCount: rows.filter((r) => r.status === 'duplicate').length,
    skippedCount: rows.filter((r) => r.status === 'skipped').length,
    errorCount: rows.filter((r) => r.status === 'error').length,
    dateMin: dates[0] ?? null,
    dateMax: dates.at(-1) ?? null,
  };
}

function toPreviewRow(row: AssignedRow, rule: RuleAssignment | undefined): PreviewRow {
  if (row.status === 'skipped' || row.status === 'error') {
    return {
      line: row.line,
      status: row.status,
      reason: row.reason,
      date: null,
      postedDate: null,
      amountCents: null,
      description: null,
      memo: null,
      merchantKey: null,
      bankCategory: null,
      externalId: null,
      dedupKey: null,
      occurrence: null,
      ownerId: null,
      categoryId: null,
      ruleId: null,
      raw: row.raw,
    };
  }
  return {
    line: row.line,
    status: row.status,
    reason: null,
    date: row.date,
    postedDate: row.postedDate,
    amountCents: row.amountCents,
    description: row.description,
    memo: row.memo,
    merchantKey: row.merchantKey,
    bankCategory: row.bankCategory,
    externalId: row.externalId,
    dedupKey: row.dedupKey,
    occurrence: row.occurrence,
    ownerId: rule?.ownerId ?? row.ownerId,
    categoryId: rule?.categoryId ?? null,
    ruleId: rule?.ruleId ?? null,
    raw: row.raw,
  };
}

/** The account to import into: 404 when missing, 409 when archived. */
function requireImportableAccount(db: DbOrTx, accountId: number): Account {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (account === undefined) throw notFound('Account', accountId);
  if (account.archived) {
    throw new HttpError(
      409,
      'account_archived',
      `${account.name} is archived; restore it in Settings to import into it`,
    );
  }
  return account;
}

/** Months (YYYY-MM) among `dates` that already hold legacy rows (no account). */
function legacyMonths(db: DbOrTx, dates: readonly string[]): string[] {
  const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
  if (months.length === 0) return [];
  const month = sql<string>`substr(${transactions.date}, 1, 7)`;
  return db
    .selectDistinct({ month })
    .from(transactions)
    .where(and(isNull(transactions.accountId), inArray(month, months)))
    .orderBy(month)
    .all()
    .map((r) => r.month);
}

export type PreviewInput = {
  accountId: number;
  filename: string;
  content: Uint8Array;
  uploadedByOwnerId: number;
};

/**
 * POST /imports/preview. Parses the file with the account's mapping, compares it with the
 * account's transactions, and stores an import in `preview` with the counts it would have.
 * 400 when the file lacks a column the mapping reads, or has no rows.
 */
export function previewImport(
  db: Db,
  clock: Clock,
  engine: RuleEngine,
  input: PreviewInput,
): ImportPreviewResponse {
  const { content } = input;
  if (content.byteLength > MAX_IMPORT_BYTES) {
    throw new HttpError(
      400,
      'file_too_large',
      `The file is larger than ${MAX_IMPORT_BYTES / 1024 / 1024} MB`,
    );
  }

  return db.transaction((tx) => {
    const account = requireImportableAccount(tx, input.accountId);
    const missing = missingCsvColumns(content, account.csvMapping);
    if (missing.length > 0) {
      throw new HttpError(
        400,
        'missing_columns',
        `The file has no column named ${missing.map((m) => `"${m}"`).join(', ')}, which the ` +
          `mapping of ${account.name} reads. Check that this is a ${account.name} file, or edit ` +
          'the account mapping in Settings.',
        { missingColumns: missing },
      );
    }

    const rawCsv = decodeCsvBytes(content, account.csvMapping.encoding);
    const rows = compareWithAccount(tx, account.id, parseStored(account, rawCsv));
    if (rows.length === 0) {
      throw new HttpError(400, 'empty_file', 'The file has no transaction rows');
    }
    const rules = categorizeNewRows(tx, engine, account.id, rows);
    const counts = countRows(rows);
    const fileSha256 = createHash('sha256').update(content).digest('hex');

    const { id } = tx
      .insert(imports)
      .values({
        accountId: account.id,
        filename: input.filename,
        fileSha256,
        rawCsv,
        status: 'preview',
        uploadedByOwnerId: input.uploadedByOwnerId,
        ...counts,
        createdAt: clock(),
        kind: 'csv',
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

    const parsedDates = rows.flatMap((r) =>
      r.status === 'new' || r.status === 'duplicate' ? [r.date] : [],
    );

    return {
      import: requireSummary(tx, id),
      rows: rows.map((r) => toPreviewRow(r, rules.get(r.line))),
      sameFileImportIds,
      legacyOverlapMonths: legacyMonths(tx, parsedDates),
    };
  });
}

/**
 * POST /imports/:id/commit. In one database transaction: re-reads the stored file, inserts the
 * rows that are still new (less any line in `skipLines`, counted as skipped), applies rules to
 * them, and marks the import committed with its final counts. 409 unless the import is a preview.
 */
export function commitImport(
  db: Db,
  clock: Clock,
  engine: RuleEngine,
  id: number,
  skipLines: readonly number[],
): ImportSummary {
  return db.transaction((tx) => {
    const stored = tx.select().from(imports).where(eq(imports.id, id)).get();
    if (stored === undefined) throw notFound('Import', id);
    if (stored.status !== 'preview') {
      throw new HttpError(409, 'not_a_preview', `Import ${id} is already ${stored.status}`);
    }
    if (stored.accountId === null) {
      throw new HttpError(400, 'no_account', `Import ${id} has no account`);
    }
    const account = tx.select().from(accounts).where(eq(accounts.id, stored.accountId)).get();
    if (account === undefined) throw notFound('Account', stored.accountId);

    const skip = new Set(skipLines);
    const rows = compareWithAccount(tx, account.id, parseStored(account, stored.rawCsv)).map(
      (row): AssignedRow =>
        row.status === 'new' && skip.has(row.line)
          ? { line: row.line, raw: row.raw, status: 'skipped', reason: 'Left out in the preview' }
          : row,
    );
    const rules = categorizeNewRows(tx, engine, account.id, rows);
    const now = clock();

    for (const row of rows) {
      if (row.status !== 'new') continue;
      const rule = rules.get(row.line);
      tx.insert(transactions)
        .values({
          accountId: account.id,
          importId: id,
          ownerId: rule?.ownerId ?? row.ownerId,
          categoryId: rule?.categoryId ?? null,
          categorySource: rule === undefined ? null : 'rule',
          ruleId: rule?.ruleId ?? null,
          date: row.date,
          postedDate: row.postedDate,
          amountCents: row.amountCents,
          description: row.description,
          memo: row.memo,
          merchantKey: row.merchantKey,
          bankCategory: row.bankCategory,
          externalId: row.externalId,
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
      .set({ ...countRows(rows), status: 'committed', committedAt: now })
      .where(eq(imports.id, id))
      .run();
    return requireSummary(tx, id);
  });
}

/**
 * POST /imports/:id/undo. Deletes the import's transactions (manual edits included) and marks it
 * undone. 409 unless the import is committed.
 */
export function undoImport(db: Db, clock: Clock, id: number): ImportSummary {
  return db.transaction((tx) => {
    const summary = requireSummary(tx, id);
    if (summary.status !== 'committed') {
      throw new HttpError(409, 'not_committed', `Import ${id} is ${summary.status}, not committed`);
    }
    tx.delete(transactions).where(eq(transactions.importId, id)).run();
    tx.update(imports).set({ status: 'undone', undoneAt: clock() }).where(eq(imports.id, id)).run();
    return requireSummary(tx, id);
  });
}

/**
 * Deletes previews created more than 24 hours before `now` (run at server start). Previews have
 * no transactions, so nothing else is touched. Returns how many were deleted.
 */
export function deleteStalePreviews(db: Db, clock: Clock): number {
  const cutoff = new Date(Date.parse(clock()) - PREVIEW_MAX_AGE_MS).toISOString();
  return db
    .delete(imports)
    .where(and(eq(imports.status, 'preview'), lt(imports.createdAt, cutoff)))
    .run().changes;
}
