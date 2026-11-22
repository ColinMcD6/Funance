import type { Category, CreateCategoryRequest, UpdateCategoryRequest } from '@funance/shared';
import { and, asc, eq, max, ne, sql } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { categories, rules, transactions } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Every category, archived ones included, in display order. */
export function listCategories(db: Db): Category[] {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)).all();
}

/** 409 when another category (other than `exceptId`) has `name`, ignoring case. */
function checkNameFree(tx: Tx, name: string, exceptId?: number): void {
  const sameName = sql`lower(${categories.name}) = lower(${name})`;
  const clash = tx
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(exceptId === undefined ? sameName : and(sameName, ne(categories.id, exceptId)))
    .get();
  if (clash !== undefined) {
    throw new HttpError(409, 'conflict', `A category named "${clash.name}" already exists`);
  }
}

function getCategory(tx: Tx, id: number): Category {
  const category = tx.select().from(categories).where(eq(categories.id, id)).get();
  if (category === undefined) throw notFound('Category', id);
  return category;
}

/** Creates a category; without a `sortOrder` it goes after the last one. */
export function createCategory(db: Db, input: CreateCategoryRequest): Category {
  return db.transaction((tx) => {
    checkNameFree(tx, input.name);
    const last =
      tx
        .select({ n: max(categories.sortOrder) })
        .from(categories)
        .get()?.n ?? 0;
    return tx
      .insert(categories)
      .values({ ...input, sortOrder: input.sortOrder ?? last + 1, archived: false })
      .returning()
      .get();
  });
}

/**
 * Archives `category`. Its rules can no longer assign it: with `reassignTo` they are pointed at
 * the new category, along with every transaction; without it they are disabled and the
 * transactions keep the archived category.
 */
function archive(tx: Tx, clock: Clock, category: Category, reassignTo?: number): Category {
  if (reassignTo === undefined) {
    tx.update(rules).set({ enabled: false }).where(eq(rules.setCategoryId, category.id)).run();
  } else {
    if (reassignTo === category.id) {
      throw new HttpError(400, 'invalid_reference', 'A category cannot be reassigned to itself');
    }
    const target = tx.select().from(categories).where(eq(categories.id, reassignTo)).get();
    if (target === undefined) {
      throw new HttpError(400, 'invalid_reference', `Unknown category id: ${reassignTo}`);
    }
    if (target.archived) {
      throw new HttpError(
        400,
        'archived_category',
        `Category "${target.name}" is archived and cannot be assigned`,
      );
    }
    tx.update(transactions)
      .set({ categoryId: target.id, updatedAt: clock() })
      .where(eq(transactions.categoryId, category.id))
      .run();
    tx.update(rules)
      .set({ setCategoryId: target.id })
      .where(eq(rules.setCategoryId, category.id))
      .run();
  }
  return tx
    .update(categories)
    .set({ archived: true })
    .where(eq(categories.id, category.id))
    .returning()
    .get();
}

/**
 * Applies a partial edit: rename, kind, color, group, order. `archived: true` archives as
 * DELETE without `reassignTo` does; `archived: false` restores. 404 when it does not exist.
 */
export function updateCategory(
  db: Db,
  clock: Clock,
  id: number,
  patch: UpdateCategoryRequest,
): Category {
  return db.transaction((tx) => {
    const current = getCategory(tx, id);
    if (patch.name !== undefined) checkNameFree(tx, patch.name, id);
    const { archived, ...fields } = patch;
    let updated = current;
    if (Object.keys(fields).length > 0) {
      updated = tx.update(categories).set(fields).where(eq(categories.id, id)).returning().get();
    }
    if (archived === true && !current.archived) return archive(tx, clock, updated);
    if (archived === false && current.archived) {
      return tx
        .update(categories)
        .set({ archived: false })
        .where(eq(categories.id, id))
        .returning()
        .get();
    }
    return updated;
  });
}

/** DELETE /categories/:id: archives, first moving its transactions to `reassignTo` if given. */
export function archiveCategory(
  db: Db,
  clock: Clock,
  id: number,
  reassignTo: number | undefined,
): Category {
  return db.transaction((tx) => archive(tx, clock, getCategory(tx, id), reassignTo));
}
