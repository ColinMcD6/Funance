import { z } from 'zod';
import { csvMappingSchema } from './csv-mapping.js';
import {
  centsSchema,
  countSchema,
  hexColorSchema,
  idSchema,
  isoDateSchema,
  rawRowSchema,
  timestampSchema,
  yearMonthSchema,
} from './primitives.js';

// Entity schemas mirror the seven tables in PLAN.md section 2, field for field, in camelCase.
// apps/server/src/db/schema.test.ts asserts the Drizzle tables match them.

// Allowed values of each enum column, as tuples so the Drizzle schema can share them.
export const OWNER_KINDS = ['person', 'joint'] as const;
export const INSTITUTIONS = ['rbc', 'tangerine', 'simplii', 'walmart', 'other'] as const;
export const ACCOUNT_TYPES = ['chequing', 'savings', 'credit_card'] as const;
export const IMPORT_STATUSES = ['preview', 'committed', 'undone'] as const;
export const IMPORT_KINDS = ['csv', 'legacy'] as const;
export const CATEGORY_KINDS = ['expense', 'income', 'savings', 'transfer'] as const;
export const CATEGORY_SOURCES = ['manual', 'rule', 'suggestion'] as const;
export const RULE_MATCH_FIELDS = ['description', 'memo', 'bank_category'] as const;
export const RULE_MATCH_TYPES = ['contains', 'starts_with', 'equals', 'regex'] as const;
export const DIRECTIONS = ['outflow', 'inflow'] as const;

export const ownerKindSchema = z.enum(OWNER_KINDS);
export const institutionSchema = z.enum(INSTITUTIONS);
export const accountTypeSchema = z.enum(ACCOUNT_TYPES);
export const importStatusSchema = z.enum(IMPORT_STATUSES);
export const importKindSchema = z.enum(IMPORT_KINDS);
export const categoryKindSchema = z.enum(CATEGORY_KINDS);
export const categorySourceSchema = z.enum(CATEGORY_SOURCES);
export const ruleMatchFieldSchema = z.enum(RULE_MATCH_FIELDS);
export const ruleMatchTypeSchema = z.enum(RULE_MATCH_TYPES);
export const directionSchema = z.enum(DIRECTIONS);

export type OwnerKind = z.infer<typeof ownerKindSchema>;
export type Institution = z.infer<typeof institutionSchema>;
export type AccountType = z.infer<typeof accountTypeSchema>;
export type ImportStatus = z.infer<typeof importStatusSchema>;
export type ImportKind = z.infer<typeof importKindSchema>;
export type CategoryKind = z.infer<typeof categoryKindSchema>;
export type CategorySource = z.infer<typeof categorySourceSchema>;
export type RuleMatchField = z.infer<typeof ruleMatchFieldSchema>;
export type RuleMatchType = z.infer<typeof ruleMatchTypeSchema>;
export type Direction = z.infer<typeof directionSchema>;

const nameSchema = z.string().trim().min(1).max(100);

export const ownerSchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: ownerKindSchema,
  sortOrder: z.int(),
});
export type Owner = z.infer<typeof ownerSchema>;

export const accountSchema = z.object({
  id: idSchema,
  name: nameSchema,
  institution: institutionSchema,
  type: accountTypeSchema,
  defaultOwnerId: idSchema,
  csvMapping: csvMappingSchema,
  archived: z.boolean(),
  createdAt: timestampSchema,
});
export type Account = z.infer<typeof accountSchema>;

export const importSchema = z.object({
  id: idSchema,
  /** Required when kind is csv; null when kind is legacy. */
  accountId: idSchema.nullable(),
  filename: z.string().min(1),
  fileSha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** Original file content (for a legacy import, empty: the workbook is binary). */
  rawCsv: z.string(),
  status: importStatusSchema,
  uploadedByOwnerId: idSchema,
  rowCount: countSchema,
  insertedCount: countSchema,
  duplicateCount: countSchema,
  skippedCount: countSchema,
  errorCount: countSchema,
  dateMin: isoDateSchema.nullable(),
  dateMax: isoDateSchema.nullable(),
  createdAt: timestampSchema,
  committedAt: timestampSchema.nullable(),
  undoneAt: timestampSchema.nullable(),
  kind: importKindSchema,
});
export type Import = z.infer<typeof importSchema>;

export const transactionSchema = z.object({
  id: idSchema,
  /** Null only for rows from a legacy import. */
  accountId: idSchema.nullable(),
  importId: idSchema,
  ownerId: idSchema,
  /** Null = uncategorized. */
  categoryId: idSchema.nullable(),
  categorySource: categorySourceSchema.nullable(),
  ruleId: idSchema.nullable(),
  date: isoDateSchema,
  postedDate: isoDateSchema.nullable(),
  amountCents: centsSchema,
  description: z.string(),
  memo: z.string().nullable(),
  merchantKey: z.string(),
  bankCategory: z.string().nullable(),
  externalId: z.string().nullable(),
  dedupKey: z.string().min(1),
  /** 1-based index among identical rows. */
  occurrence: z.int().positive(),
  notes: z.string().nullable(),
  /** Hides a row from reports without deleting it. */
  excluded: z.boolean(),
  rawRow: rawRowSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
});
export type Transaction = z.infer<typeof transactionSchema>;

export const categorySchema = z.object({
  id: idSchema,
  name: nameSchema,
  kind: categoryKindSchema,
  color: hexColorSchema,
  sortOrder: z.int(),
  /** Archived categories keep their history but cannot be newly assigned. */
  archived: z.boolean(),
  /** Major category, e.g. Joy. */
  groupName: nameSchema,
});
export type Category = z.infer<typeof categorySchema>;

export const ruleSchema = z.object({
  id: idSchema,
  /** Lower runs first; the first match wins. */
  priority: z.int(),
  matchField: ruleMatchFieldSchema,
  /** All match types are case-insensitive. */
  matchType: ruleMatchTypeSchema,
  pattern: z.string().min(1),
  accountId: idSchema.nullable(),
  /** Null = both directions. */
  direction: directionSchema.nullable(),
  setCategoryId: idSchema,
  setOwnerId: idSchema.nullable(),
  enabled: z.boolean(),
  createdAt: timestampSchema,
});
export type Rule = z.infer<typeof ruleSchema>;

export const budgetSchema = z.object({
  id: idSchema,
  categoryId: idSchema,
  /** Null = whole household. */
  ownerId: idSchema.nullable(),
  monthlyAmountCents: centsSchema.nonnegative(),
  /** The latest row at or before a month applies. */
  effectiveFrom: yearMonthSchema,
});
export type Budget = z.infer<typeof budgetSchema>;
