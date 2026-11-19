import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  CATEGORY_SOURCES,
  DIRECTIONS,
  IMPORT_KINDS,
  IMPORT_STATUSES,
  INSTITUTIONS,
  OWNER_KINDS,
  RULE_MATCH_FIELDS,
  RULE_MATCH_TYPES,
  type CsvMapping,
  type RawRow,
} from '@funance/shared';
import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core';

// The seven tables of PLAN.md section 2. Frozen in M1: change only through the contract-change
// process in CLAUDE.md. Columns are snake_case; the TypeScript keys match the entity schemas in
// packages/shared/src/entities.ts (asserted by schema.test.ts).

/** SQLite has no boolean type: 0 or 1, read back as a boolean. */
const bool = (name: string) => integer(name, { mode: 'boolean' });

/** CHECK constraint that keeps a text enum column to its allowed values. */
function inList(column: AnySQLiteColumn, values: readonly string[]) {
  return sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(', '))})`;
}

export const owners = sqliteTable(
  'owners',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    kind: text('kind', { enum: OWNER_KINDS }).notNull(),
    sortOrder: integer('sort_order').notNull(),
  },
  (t) => [check('owners_kind_check', inList(t.kind, OWNER_KINDS))],
);

export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    institution: text('institution', { enum: INSTITUTIONS }).notNull(),
    type: text('type', { enum: ACCOUNT_TYPES }).notNull(),
    defaultOwnerId: integer('default_owner_id')
      .notNull()
      .references(() => owners.id),
    csvMapping: text('csv_mapping', { mode: 'json' }).$type<CsvMapping>().notNull(),
    archived: bool('archived').notNull().default(false),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    check('accounts_institution_check', inList(t.institution, INSTITUTIONS)),
    check('accounts_type_check', inList(t.type, ACCOUNT_TYPES)),
  ],
);

export const imports = sqliteTable(
  'imports',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id').references(() => accounts.id),
    filename: text('filename').notNull(),
    fileSha256: text('file_sha256').notNull(),
    rawCsv: text('raw_csv').notNull(),
    status: text('status', { enum: IMPORT_STATUSES }).notNull(),
    uploadedByOwnerId: integer('uploaded_by_owner_id')
      .notNull()
      .references(() => owners.id),
    rowCount: integer('row_count').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    skippedCount: integer('skipped_count').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    dateMin: text('date_min'),
    dateMax: text('date_max'),
    createdAt: text('created_at').notNull(),
    committedAt: text('committed_at'),
    undoneAt: text('undone_at'),
    kind: text('kind', { enum: IMPORT_KINDS }).notNull(),
  },
  (t) => [
    index('imports_account_idx').on(t.accountId),
    index('imports_sha_idx').on(t.fileSha256),
    check('imports_status_check', inList(t.status, IMPORT_STATUSES)),
    check('imports_kind_check', inList(t.kind, IMPORT_KINDS)),
    // A csv import always has an account; a legacy import never does.
    check(
      'imports_account_kind_check',
      sql`(${t.kind} = 'csv' and ${t.accountId} is not null) or (${t.kind} = 'legacy' and ${t.accountId} is null)`,
    ),
  ],
);

export const categories = sqliteTable(
  'categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull().unique(),
    kind: text('kind', { enum: CATEGORY_KINDS }).notNull(),
    color: text('color').notNull(),
    sortOrder: integer('sort_order').notNull(),
    archived: bool('archived').notNull().default(false),
    groupName: text('group_name').notNull(),
  },
  (t) => [check('categories_kind_check', inList(t.kind, CATEGORY_KINDS))],
);

export const rules = sqliteTable(
  'rules',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    priority: integer('priority').notNull(),
    matchField: text('match_field', { enum: RULE_MATCH_FIELDS }).notNull(),
    matchType: text('match_type', { enum: RULE_MATCH_TYPES }).notNull(),
    pattern: text('pattern').notNull(),
    accountId: integer('account_id').references(() => accounts.id),
    direction: text('direction', { enum: DIRECTIONS }),
    setCategoryId: integer('set_category_id')
      .notNull()
      .references(() => categories.id),
    setOwnerId: integer('set_owner_id').references(() => owners.id),
    enabled: bool('enabled').notNull().default(true),
    createdAt: text('created_at').notNull(),
  },
  (t) => [
    index('rules_priority_idx').on(t.priority),
    check('rules_match_field_check', inList(t.matchField, RULE_MATCH_FIELDS)),
    check('rules_match_type_check', inList(t.matchType, RULE_MATCH_TYPES)),
    check(
      'rules_direction_check',
      sql`${t.direction} is null or ${inList(t.direction, DIRECTIONS)}`,
    ),
  ],
);

export const transactions = sqliteTable(
  'transactions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    accountId: integer('account_id').references(() => accounts.id),
    importId: integer('import_id')
      .notNull()
      .references(() => imports.id),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => owners.id),
    categoryId: integer('category_id').references(() => categories.id),
    categorySource: text('category_source', { enum: CATEGORY_SOURCES }),
    ruleId: integer('rule_id').references(() => rules.id, { onDelete: 'set null' }),
    date: text('date').notNull(),
    postedDate: text('posted_date'),
    amountCents: integer('amount_cents').notNull(),
    description: text('description').notNull(),
    memo: text('memo'),
    merchantKey: text('merchant_key').notNull(),
    bankCategory: text('bank_category'),
    externalId: text('external_id'),
    dedupKey: text('dedup_key').notNull(),
    occurrence: integer('occurrence').notNull(),
    notes: text('notes'),
    excluded: bool('excluded').notNull().default(false),
    rawRow: text('raw_row', { mode: 'json' }).$type<RawRow>().notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('transactions_dedup_unique').on(t.accountId, t.dedupKey, t.occurrence),
    index('transactions_date_idx').on(t.date),
    index('transactions_category_date_idx').on(t.categoryId, t.date),
    index('transactions_owner_date_idx').on(t.ownerId, t.date),
    index('transactions_merchant_key_idx').on(t.merchantKey),
    index('transactions_import_idx').on(t.importId),
    check(
      'transactions_category_source_check',
      sql`${t.categorySource} is null or ${inList(t.categorySource, CATEGORY_SOURCES)}`,
    ),
    check('transactions_occurrence_check', sql`${t.occurrence} >= 1`),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    ownerId: integer('owner_id').references(() => owners.id),
    monthlyAmountCents: integer('monthly_amount_cents').notNull(),
    effectiveFrom: text('effective_from').notNull(),
  },
  (t) => [index('budgets_category_idx').on(t.categoryId, t.effectiveFrom)],
);

export const schema = {
  owners,
  accounts,
  imports,
  categories,
  rules,
  transactions,
  budgets,
};
