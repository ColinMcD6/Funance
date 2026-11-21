import { getCsvPreset } from '@funance/core';
import { count, eq } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from './migrate.js';
import { accounts, categories, owners, rules } from './schema.js';
import {
  SEED_ACCOUNTS,
  SEED_CARD_PAYMENT_PATTERNS,
  SEED_CATEGORIES,
  SEED_OWNERS,
} from './seed-data.js';

/**
 * Writes the default owners, categories, accounts and card-payment rules, but only into an empty
 * database (no owners yet). Once seeded, it never runs again, so renames and edits made in
 * Settings are kept. Returns true when it seeded.
 */
export function seedDefaults(db: Db, clock: Clock): boolean {
  return db.transaction((tx) => {
    const existing = tx.select({ n: count() }).from(owners).get();
    if ((existing?.n ?? 0) > 0) return false;

    const now = clock();
    const ownerIds = new Map<string, number>();
    for (const owner of SEED_OWNERS) {
      const row = tx.insert(owners).values(owner).returning({ id: owners.id }).get();
      ownerIds.set(owner.name, row.id);
    }

    tx.insert(categories)
      .values(SEED_CATEGORIES.map((c, i) => ({ ...c, sortOrder: i + 1, archived: false })))
      .run();

    for (const account of SEED_ACCOUNTS) {
      const defaultOwnerId = ownerIds.get(account.defaultOwner);
      if (defaultOwnerId === undefined)
        throw new Error(`Seed owner missing: ${account.defaultOwner}`);
      tx.insert(accounts)
        .values({
          name: account.name,
          institution: account.institution,
          type: account.type,
          defaultOwnerId,
          csvMapping: structuredClone(getCsvPreset(account.preset).mapping),
          archived: false,
          createdAt: now,
        })
        .run();
    }

    const cardPayment = tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.name, 'Card Payment'))
      .get();
    if (cardPayment === undefined) throw new Error('Seed category missing: Card Payment');
    tx.insert(rules)
      .values(
        SEED_CARD_PAYMENT_PATTERNS.map((pattern, i) => ({
          priority: (i + 1) * 10,
          matchField: 'description' as const,
          matchType: 'contains' as const,
          pattern,
          accountId: null,
          direction: null,
          setCategoryId: cardPayment.id,
          setOwnerId: null,
          enabled: true,
          createdAt: now,
        })),
      )
      .run();
    return true;
  });
}
