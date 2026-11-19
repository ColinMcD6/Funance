import { join } from 'node:path';
import { transactionSchema } from '@funance/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock.js';
import { DEMO_MONTHS, seedDemo } from './demo-seed.js';
import { initDatabase } from './init.js';
import { accounts, categories, imports, transactions } from './schema.js';
import { dumpTables, makeTempDir } from './test-db.js';

const temp = makeTempDir('funance-demo-');
afterAll(() => {
  temp.cleanup();
});

const clock = fixedClock('2026-11-01T00:00:00.000Z');

function seededDatabase(name: string) {
  const db = initDatabase(join(temp.dir, name), clock);
  const summary = seedDemo(db, { clock });
  return { db, summary };
}

type Totals = { n: number; total: number; categorized: number };

function totals(db: ReturnType<typeof seededDatabase>['db']): Totals {
  return db.$client
    .prepare(
      'select count(*) as n, sum(amount_cents) as total, count(category_id) as categorized from transactions',
    )
    .get() as Totals;
}

describe('seedDemo', () => {
  const first = seededDatabase('demo-1.sqlite');
  const second = seededDatabase('demo-2.sqlite');
  afterAll(() => {
    first.db.$client.close();
    second.db.$client.close();
  });

  it('is deterministic: two runs give identical row counts and totals', () => {
    expect(totals(first.db)).toEqual(totals(second.db));
    expect(first.summary).toEqual(second.summary);
    // Stronger than the acceptance criterion: every row of every table is identical.
    expect(dumpTables(first.db.$client)).toEqual(dumpTables(second.db.$client));
  });

  it('reports the totals it wrote', () => {
    const t = totals(first.db);
    expect(first.summary).toEqual({
      imports: first.db.select().from(imports).all().length,
      transactions: t.n,
      categorized: t.categorized,
      totalCents: t.total,
    });
  });

  it('covers 14 months across all 5 accounts', () => {
    expect(DEMO_MONTHS).toHaveLength(14);
    expect(DEMO_MONTHS[0]).toBe('2025-09');
    expect(DEMO_MONTHS[13]).toBe('2026-10');
    const rows = first.db.$client
      .prepare(
        'select account_id as accountId, count(distinct substr(date, 1, 7)) as months from transactions group by account_id order by account_id',
      )
      .all();
    const accountIds = first.db
      .select({ id: accounts.id })
      .from(accounts)
      .orderBy(accounts.id)
      .all()
      .map((a) => a.id);
    expect(rows).toEqual(accountIds.map((accountId) => ({ accountId, months: 14 })));
  });

  it('leaves about 20% uncategorized', () => {
    const t = totals(first.db);
    const share = t.categorized / t.n;
    expect(share).toBeGreaterThan(0.75);
    expect(share).toBeLessThan(0.85);
  });

  it('writes rows that satisfy the transaction schema', () => {
    for (const row of first.db.select().from(transactions).all()) transactionSchema.parse(row);
  });

  it('categorizes card payments as transfers through the seeded rules', () => {
    const rows = first.db.$client
      .prepare(
        `select t.category_source as source, count(*) as n, count(t.rule_id) as withRule
         from transactions t join categories c on c.id = t.category_id
         where c.name = 'Card Payment' group by t.category_source`,
      )
      .all();
    expect(rows).toEqual([{ source: 'rule', n: 14 * 5, withRule: 14 * 5 }]);
  });

  it('includes income, savings and every category kind used by reports', () => {
    const kinds = first.db.$client
      .prepare(
        'select distinct c.kind from transactions t join categories c on c.id = t.category_id order by c.kind',
      )
      .all();
    expect(kinds).toEqual([
      { kind: 'expense' },
      { kind: 'income' },
      { kind: 'savings' },
      { kind: 'transfer' },
    ]);
    expect(first.db.select().from(categories).all().length).toBe(28);
  });

  it('refuses to run on a database that already has transactions', () => {
    expect(() => seedDemo(first.db, { clock })).toThrow(/already has transactions/);
  });
});
