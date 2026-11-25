import { duplicateBudget } from '@funance/core';
import type { Budget, PutBudgetsRequest } from '@funance/shared';
import { asc, sql } from 'drizzle-orm';
import type { Db } from '../db/migrate.js';
import { budgets, categories, owners } from '../db/schema.js';
import { HttpError } from '../http.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Every budget row, by category, then household before owners, then effective month. */
export function listBudgets(db: Db | Tx): Budget[] {
  return db
    .select()
    .from(budgets)
    .orderBy(
      asc(budgets.categoryId),
      sql`${budgets.ownerId} is not null`,
      asc(budgets.ownerId),
      asc(budgets.effectiveFrom),
    )
    .all();
}

/**
 * PUT /budgets: replaces every budget row with `rows`, in one transaction. 400 when a row names
 * an unknown category or owner, a transfer category (transfers count in no total, so there is
 * nothing to measure), or repeats another row's category, owner and effective month (the lookup
 * would be ambiguous). Archived categories are accepted, so their history survives a round trip.
 */
export function replaceBudgets(db: Db, rows: PutBudgetsRequest['budgets']): Budget[] {
  const duplicate = duplicateBudget(rows);
  if (duplicate !== null) {
    throw new HttpError(
      400,
      'validation_error',
      'Two budgets share a category, owner and effective month',
      { indexes: duplicate },
    );
  }
  return db.transaction((tx) => {
    const kinds = new Map(
      tx
        .select({ id: categories.id, kind: categories.kind })
        .from(categories)
        .all()
        .map((c) => [c.id, c.kind]),
    );
    const ownerIds = new Set(
      tx
        .select({ id: owners.id })
        .from(owners)
        .all()
        .map((o) => o.id),
    );
    for (const row of rows) {
      const kind = kinds.get(row.categoryId);
      if (kind === undefined) {
        throw new HttpError(400, 'invalid_reference', `Unknown category id: ${row.categoryId}`);
      }
      if (kind === 'transfer') {
        throw new HttpError(
          400,
          'validation_error',
          `Category ${row.categoryId} is a transfer category and cannot have a budget`,
        );
      }
      if (row.ownerId !== null && !ownerIds.has(row.ownerId)) {
        throw new HttpError(400, 'invalid_reference', `Unknown owner id: ${row.ownerId}`);
      }
    }
    tx.delete(budgets).run();
    if (rows.length > 0) tx.insert(budgets).values(rows).run();
    return listBudgets(tx);
  });
}
