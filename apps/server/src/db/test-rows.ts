import type { CategorySource } from '@funance/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './migrate.js';
import { categories, imports, transactions } from './schema.js';

const EARLIER = '2026-01-01T00:00:00.000Z';

/** The id of a seeded (or created) category by name; throws when there is none. */
export function categoryIdByName(db: Db, name: string): number {
  const row = db.select().from(categories).where(eq(categories.name, name)).get();
  if (row === undefined) throw new Error(`No category named ${name}`);
  return row.id;
}

export type TestRow = {
  description: string;
  amountCents?: number;
  /** Seeded accounts are 1 to 5; null for a legacy row. */
  accountId?: number | null;
  ownerId?: number;
  date?: string;
  memo?: string | null;
  bankCategory?: string | null;
  categoryId?: number | null;
  categorySource?: CategorySource | null;
  ruleId?: number | null;
};

let dedupCounter = 0;

/**
 * Inserts transactions with test defaults (account 1, owner Colin, an outflow, uncategorized),
 * each account's rows under one committed import. Returns the new ids in order.
 */
export function insertTestRows(db: Db, rows: readonly TestRow[]): number[] {
  const importIds = new Map<number | null, number>();
  return rows.map((row) => {
    const accountId = row.accountId === undefined ? 1 : row.accountId;
    let importId = importIds.get(accountId);
    if (importId === undefined) {
      importId = db
        .insert(imports)
        .values({
          accountId,
          kind: accountId === null ? 'legacy' : 'csv',
          filename: 'test.csv',
          fileSha256: 'a'.repeat(64),
          rawCsv: '',
          status: 'committed',
          uploadedByOwnerId: 1,
          createdAt: EARLIER,
          committedAt: EARLIER,
        })
        .returning()
        .get().id;
      importIds.set(accountId, importId);
    }
    dedupCounter += 1;
    const categoryId = row.categoryId ?? null;
    return db
      .insert(transactions)
      .values({
        accountId,
        importId,
        ownerId: row.ownerId ?? 1,
        categoryId,
        categorySource: row.categorySource ?? (categoryId === null ? null : 'manual'),
        ruleId: row.ruleId ?? null,
        date: row.date ?? '2026-10-01',
        postedDate: null,
        amountCents: row.amountCents ?? -1000,
        description: row.description,
        memo: row.memo ?? null,
        merchantKey: row.description.toUpperCase(),
        bankCategory: row.bankCategory ?? null,
        externalId: null,
        dedupKey: `test-${dedupCounter}`,
        occurrence: 1,
        notes: null,
        excluded: false,
        rawRow: {},
        createdAt: EARLIER,
        updatedAt: EARLIER,
      })
      .returning()
      .get().id;
  });
}

/** One transaction by id; throws when it does not exist. */
export function getTestRow(db: Db, id: number) {
  const row = db.select().from(transactions).where(eq(transactions.id, id)).get();
  if (row === undefined) throw new Error(`No transaction ${id}`);
  return row;
}
