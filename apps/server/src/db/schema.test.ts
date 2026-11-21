import {
  accountSchema,
  budgetSchema,
  categorySchema,
  importSchema,
  ownerSchema,
  ruleSchema,
  transactionSchema,
  type Account,
  type Budget,
  type Category,
  type Import,
  type Owner,
  type Rule,
  type Transaction,
} from '@funance/shared';
import { getTableColumns, getTableName, type InferSelectModel } from 'drizzle-orm';
import type { SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { accounts, budgets, categories, imports, owners, rules, transactions } from './schema.js';

// Contract test (PLAN.md section 6): every Drizzle table matches its Zod entity schema.

const pairs: [SQLiteTable, z.ZodObject<Record<string, z.ZodType>>][] = [
  [owners, ownerSchema],
  [accounts, accountSchema],
  [imports, importSchema],
  [categories, categorySchema],
  [rules, ruleSchema],
  [transactions, transactionSchema],
  [budgets, budgetSchema],
];

describe('Drizzle schema matches the shared entity schemas', () => {
  it('covers all seven tables', () => {
    expect(pairs.map(([table]) => getTableName(table)).sort()).toEqual([
      'accounts',
      'budgets',
      'categories',
      'imports',
      'owners',
      'rules',
      'transactions',
    ]);
  });

  it.each(pairs.map(([table, entity]) => [getTableName(table), table, entity] as const))(
    '%s has the same fields and nullability',
    (_name, table, entity) => {
      const columns = getTableColumns(table);
      expect(Object.keys(columns).sort()).toEqual(Object.keys(entity.shape).sort());
      for (const [key, column] of Object.entries(columns)) {
        const field = entity.shape[key];
        expect(field, key).toBeDefined();
        const nullable = field?.safeParse(null).success ?? false;
        expect({ key, nullable }).toEqual({ key, nullable: !column.notNull });
      }
    },
  );

  it.each(pairs.map(([table]) => [getTableName(table), table] as const))(
    '%s uses snake_case column names',
    (_name, table) => {
      for (const [key, column] of Object.entries(getTableColumns(table))) {
        const snake = key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
        expect(column.name).toBe(snake);
      }
    },
  );

  it('has the same TypeScript row types (checked by pnpm typecheck)', () => {
    expectTypeOf<InferSelectModel<typeof owners>>().toEqualTypeOf<Owner>();
    expectTypeOf<InferSelectModel<typeof accounts>>().toEqualTypeOf<Account>();
    expectTypeOf<InferSelectModel<typeof imports>>().toEqualTypeOf<Import>();
    expectTypeOf<InferSelectModel<typeof categories>>().toEqualTypeOf<Category>();
    expectTypeOf<InferSelectModel<typeof rules>>().toEqualTypeOf<Rule>();
    expectTypeOf<InferSelectModel<typeof transactions>>().toEqualTypeOf<Transaction>();
    expectTypeOf<InferSelectModel<typeof budgets>>().toEqualTypeOf<Budget>();
  });
});
