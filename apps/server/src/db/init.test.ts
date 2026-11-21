import { join } from 'node:path';
import {
  accountSchema,
  categorySchema,
  ownerSchema,
  ruleSchema,
  type CsvMapping,
} from '@funance/shared';
import { getCsvPreset } from '@funance/core';
import { eq } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock.js';
import { initDatabase } from './init.js';
import { accounts, categories, owners, rules } from './schema.js';
import { seedDefaults } from './seed.js';
import { dumpTables, makeTempDir } from './test-db.js';

const temp = makeTempDir('funance-init-');
afterAll(() => {
  temp.cleanup();
});

const clock = fixedClock('2026-11-18T12:00:00.000Z');

describe('initDatabase on an empty path', () => {
  const path = join(temp.dir, 'nested', 'fresh.sqlite');
  const db = initDatabase(path, clock);
  afterAll(() => {
    db.$client.close();
  });

  it('seeds the three owners', () => {
    const rows = db.select().from(owners).orderBy(owners.sortOrder).all();
    expect(rows.map((o) => ownerSchema.parse(o))).toEqual([
      { id: 1, name: 'Colin', kind: 'person', sortOrder: 1 },
      { id: 2, name: 'Emily', kind: 'person', sortOrder: 2 },
      { id: 3, name: 'Joint', kind: 'joint', sortOrder: 3 },
    ]);
  });

  it('seeds the 26 sheet categories plus the two transfer categories', () => {
    const rows = db.select().from(categories).orderBy(categories.sortOrder).all();
    for (const row of rows) categorySchema.parse(row);
    expect(rows).toHaveLength(28);
    const kinds = Object.fromEntries(rows.map((c) => [c.name, c.kind]));
    expect(kinds).toMatchObject({
      Income: 'income',
      Investing: 'savings',
      'Debt Payments': 'expense',
      'Card Payment': 'transfer',
      Transfer: 'transfer',
    });
    const nonExpense = rows.filter((c) => c.kind !== 'expense').map((c) => c.name);
    expect(nonExpense.sort()).toEqual(['Card Payment', 'Income', 'Investing', 'Transfer']);

    const groups: Record<string, string[]> = {};
    for (const c of rows) (groups[c.groupName] ??= []).push(c.name);
    expect(groups).toEqual({
      Clothing: ['Clothing'],
      Giving: ['Donation', 'Gifts'],
      Groceries: ['Groceries'],
      Housing: ['Home'],
      Joy: ['Coffee', 'Eating out', 'Entertainment', 'Hobbies', 'Alcohol'],
      Kid: ['Baby'],
      Money: ['Investing', 'Debt Payments', 'Income'],
      Pet: ['Cat'],
      Transportation: ['Gas', 'Car Insurance', 'Transportation (Other)', 'Car Maintenance'],
      Travel: ['Travel'],
      Utilities: ['Internet', 'Phone'],
      Vacation: ['Vacation'],
      Wellbeing: ['Health', 'Personal Care'],
      Education: ['Education'],
      Transfers: ['Card Payment', 'Transfer'],
    });
    expect(new Set(rows.map((c) => c.color)).size).toBe(28);
  });

  it('seeds the five accounts with their presets and default owners', () => {
    const rows = db
      .select({ account: accounts, owner: owners.name })
      .from(accounts)
      .innerJoin(owners, eq(accounts.defaultOwnerId, owners.id))
      .orderBy(accounts.id)
      .all();
    for (const { account } of rows) accountSchema.parse(account);
    expect(
      rows.map((r) => [r.account.name, r.account.institution, r.account.type, r.owner]),
    ).toEqual([
      ['Tangerine Chequing', 'tangerine', 'chequing', 'Colin'],
      ['Tangerine Mastercard', 'tangerine', 'credit_card', 'Colin'],
      ['Simplii Visa', 'simplii', 'credit_card', 'Joint'],
      ['Walmart Mastercard', 'walmart', 'credit_card', 'Joint'],
      ['RBC', 'rbc', 'chequing', 'Emily'],
    ]);
    const mappings = Object.fromEntries(rows.map((r) => [r.account.name, r.account.csvMapping]));
    const expected: Record<string, CsvMapping> = {
      'Tangerine Chequing': getCsvPreset('tangerine-chequing').mapping,
      'Tangerine Mastercard': getCsvPreset('tangerine-mastercard').mapping,
      'Simplii Visa': getCsvPreset('simplii').mapping,
      'Walmart Mastercard': getCsvPreset('walmart-mastercard').mapping,
      RBC: getCsvPreset('rbc').mapping,
    };
    expect(mappings).toEqual(expected);
    // Every Walmart row is Joint whichever cardholder made the purchase.
    expect(mappings['Walmart Mastercard']?.ownerHintMap).toEqual({});
    expect(rows.every((r) => r.account.createdAt === clock())).toBe(true);
  });

  it('seeds the three card-payment rules', () => {
    const rows = db
      .select({ rule: rules, category: categories.name })
      .from(rules)
      .innerJoin(categories, eq(rules.setCategoryId, categories.id))
      .orderBy(rules.priority)
      .all();
    for (const { rule } of rows) ruleSchema.parse(rule);
    expect(
      rows.map((r) => [r.rule.pattern, r.rule.matchField, r.rule.matchType, r.category]),
    ).toEqual([
      ['PAYMENT - THANK YOU', 'description', 'contains', 'Card Payment'],
      ['PAYMENT THANK YOU', 'description', 'contains', 'Card Payment'],
      ['Credit Card Payment', 'description', 'contains', 'Card Payment'],
    ]);
    expect(rows.every((r) => r.rule.enabled && r.rule.accountId === null)).toBe(true);
  });

  it('creates no transactions, imports or budgets', () => {
    const dump = dumpTables(db.$client);
    expect(dump.transactions).toEqual([]);
    expect(dump.imports).toEqual([]);
    expect(dump.budgets).toEqual([]);
  });
});

describe('initDatabase on an existing database', () => {
  it('changes nothing when started again', () => {
    const path = join(temp.dir, 'restart.sqlite');
    const first = initDatabase(path, clock);
    const before = dumpTables(first.$client);
    first.$client.close();

    const second = initDatabase(path, fixedClock('2027-01-01T00:00:00.000Z'));
    try {
      expect(dumpTables(second.$client)).toEqual(before);
      expect(seedDefaults(second, clock)).toBe(false);
    } finally {
      second.$client.close();
    }
  });

  it('keeps a renamed owner instead of re-adding the seed name', () => {
    const path = join(temp.dir, 'renamed.sqlite');
    const first = initDatabase(path, clock);
    first.update(owners).set({ name: 'Alex' }).where(eq(owners.name, 'Colin')).run();
    first.$client.close();

    const second = initDatabase(path, clock);
    try {
      const names = second.select({ name: owners.name }).from(owners).all();
      expect(names.map((n) => n.name).sort()).toEqual(['Alex', 'Emily', 'Joint']);
    } finally {
      second.$client.close();
    }
  });
});

describe('the database constraints', () => {
  const path = join(temp.dir, 'constraints.sqlite');
  const db = initDatabase(path, clock);
  afterAll(() => {
    db.$client.close();
  });

  it('rejects an enum value outside its list', () => {
    expect(() =>
      db.$client.prepare("update categories set kind = 'bogus' where id = 1").run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a csv import without an account', () => {
    expect(() =>
      db.$client
        .prepare(
          "insert into imports (filename, file_sha256, raw_csv, status, uploaded_by_owner_id, created_at, kind) values ('a.csv', 'x', '', 'preview', 1, 'now', 'csv')",
        )
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it('enforces foreign keys', () => {
    expect(() =>
      db.$client.prepare('update accounts set default_owner_id = 999 where id = 1').run(),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });
});
