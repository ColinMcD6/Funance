import type {
  Transaction,
  TransactionListResponse,
  TransactionPatch,
  TransactionQuery,
} from '@funance/shared';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { categories, owners, transactions } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** True when `column` contains `q`, ignoring ASCII case (SQLite's `lower` folds ASCII only). */
function containsText(column: AnySQLiteColumn, q: string): SQL {
  return sql`instr(lower(coalesce(${column}, '')), lower(${q})) > 0`;
}

function filterConditions(query: TransactionQuery): SQL[] {
  const t = transactions;
  const conditions: SQL[] = [];
  if (query.owner !== undefined) conditions.push(eq(t.ownerId, query.owner));
  if (query.account === 'none') conditions.push(isNull(t.accountId));
  else if (query.account !== undefined) conditions.push(eq(t.accountId, query.account));
  if (query.category === 'none') conditions.push(isNull(t.categoryId));
  else if (query.category !== undefined) conditions.push(eq(t.categoryId, query.category));
  if (query.from !== undefined) conditions.push(gte(t.date, query.from));
  if (query.to !== undefined) conditions.push(lte(t.date, query.to));
  if (query.minCents !== undefined) conditions.push(gte(t.amountCents, query.minCents));
  if (query.maxCents !== undefined) conditions.push(lte(t.amountCents, query.maxCents));
  if (query.excluded !== undefined) conditions.push(eq(t.excluded, query.excluded));
  if (query.q !== undefined) {
    const searched = or(
      containsText(t.description, query.q),
      containsText(t.memo, query.q),
      containsText(t.notes, query.q),
    );
    if (searched !== undefined) conditions.push(searched);
  }
  return conditions;
}

/** ORDER BY for a sort; ties fall back to id in the same direction, so pages never overlap. */
function orderBy(query: TransactionQuery): SQL[] {
  const t = transactions;
  const dir = query.order === 'asc' ? asc : desc;
  const key: Record<TransactionQuery['sort'], SQL[]> = {
    date: [dir(t.date)],
    amount: [dir(t.amountCents)],
    description: [dir(sql`${t.description} collate nocase`)],
  };
  return [...key[query.sort], dir(t.id)];
}

/** One page of transactions matching every filter in `query`, and the total that match. */
export function listTransactions(db: Db, query: TransactionQuery): TransactionListResponse {
  const where = and(...filterConditions(query));
  const total = db.select({ n: count() }).from(transactions).where(where).get()?.n ?? 0;
  const items = db
    .select()
    .from(transactions)
    .where(where)
    .orderBy(...orderBy(query))
    .limit(query.pageSize)
    .offset((query.page - 1) * query.pageSize)
    .all();
  return { items, total };
}

type ResolvedPatch = Partial<
  Pick<Transaction, 'ownerId' | 'categoryId' | 'categorySource' | 'ruleId' | 'notes' | 'excluded'>
>;

/**
 * Checks a patch's references and turns it into column values. Setting a category records its
 * source (`manual` unless the client says `suggestion`) and clears the rule that set the old one;
 * clearing it clears both. Archived categories cannot be newly assigned, so they are accepted
 * only for rows that already have them (`currentCategoryIds`).
 */
function resolvePatch(
  tx: Tx,
  patch: TransactionPatch,
  currentCategoryIds: ReadonlySet<number | null>,
): ResolvedPatch {
  const resolved: ResolvedPatch = {};
  if (patch.categorySource !== undefined && patch.categoryId == null) {
    throw new HttpError(400, 'validation_error', 'categorySource needs a categoryId');
  }
  if (patch.ownerId !== undefined) {
    const owner = tx.select().from(owners).where(eq(owners.id, patch.ownerId)).get();
    if (owner === undefined) {
      throw new HttpError(400, 'invalid_reference', `Unknown owner id: ${patch.ownerId}`);
    }
    resolved.ownerId = patch.ownerId;
  }
  if (patch.categoryId === null) {
    Object.assign(resolved, { categoryId: null, categorySource: null, ruleId: null });
  } else if (patch.categoryId !== undefined) {
    const category = tx.select().from(categories).where(eq(categories.id, patch.categoryId)).get();
    if (category === undefined) {
      throw new HttpError(400, 'invalid_reference', `Unknown category id: ${patch.categoryId}`);
    }
    const unchangedOnly = currentCategoryIds.size === 1 && currentCategoryIds.has(category.id);
    if (category.archived && !unchangedOnly) {
      throw new HttpError(
        400,
        'archived_category',
        `Category "${category.name}" is archived and cannot be assigned`,
      );
    }
    Object.assign(resolved, {
      categoryId: category.id,
      categorySource: patch.categorySource ?? 'manual',
      ruleId: null,
    });
  }
  if (patch.notes !== undefined) resolved.notes = patch.notes;
  if (patch.excluded !== undefined) resolved.excluded = patch.excluded;
  return resolved;
}

function differs(row: Transaction, patch: ResolvedPatch): boolean {
  return (Object.keys(patch) as (keyof ResolvedPatch)[]).some((key) => row[key] !== patch[key]);
}

/** Edits one transaction. 404 when it does not exist, 400 for an unknown owner or category. */
export function updateTransaction(
  db: Db,
  clock: Clock,
  id: number,
  patch: TransactionPatch,
): Transaction {
  return db.transaction((tx) => {
    const current = tx.select().from(transactions).where(eq(transactions.id, id)).get();
    if (current === undefined) throw notFound('Transaction', id);
    const resolved = resolvePatch(tx, patch, new Set([current.categoryId]));
    if (!differs(current, resolved)) return current;
    return tx
      .update(transactions)
      .set({ ...resolved, updatedAt: clock() })
      .where(eq(transactions.id, id))
      .returning()
      .get();
  });
}

/**
 * Applies one patch to many transactions, all or nothing: 404 when any id does not exist.
 * Returns how many rows actually changed.
 */
export function bulkUpdateTransactions(
  db: Db,
  clock: Clock,
  ids: readonly number[],
  patch: TransactionPatch,
): number {
  const unique = [...new Set(ids)];
  return db.transaction((tx) => {
    const rows = tx.select().from(transactions).where(inArray(transactions.id, unique)).all();
    if (rows.length !== unique.length) {
      const found = new Set(rows.map((r) => r.id));
      const missing = unique.filter((id) => !found.has(id));
      throw new HttpError(
        404,
        'not_found',
        `Transaction ${missing.join(', ')} does not exist`,
        missing,
      );
    }
    const resolved = resolvePatch(tx, patch, new Set(rows.map((r) => r.categoryId)));
    const changing = rows.filter((row) => differs(row, resolved)).map((row) => row.id);
    if (changing.length > 0) {
      tx.update(transactions)
        .set({ ...resolved, updatedAt: clock() })
        .where(inArray(transactions.id, changing))
        .run();
    }
    return changing.length;
  });
}
