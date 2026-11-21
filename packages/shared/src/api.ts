import { z } from 'zod';
import { csvMappingSchema, csvPresetIdSchema } from './csv-mapping.js';
import {
  accountSchema,
  accountTypeSchema,
  budgetSchema,
  categoryKindSchema,
  categorySchema,
  directionSchema,
  importSchema,
  institutionSchema,
  ownerSchema,
  ruleMatchFieldSchema,
  ruleMatchTypeSchema,
  ruleSchema,
  transactionSchema,
} from './entities.js';
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

// Request and response shapes for every route in PLAN.md section 2, "API".
// All routes live under /api. Query and path schemas accept strings (as they arrive in a URL)
// and output typed values; body and response schemas are plain JSON.

/** Error body returned by every failing `/api` route (400 validation, 401, 404, 409). */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

/** Name of the cookie holding the active profile's owner id. */
export const PROFILE_COOKIE = 'profile';

// ---- Shared helpers ----

const queryId = z.coerce.number().int().positive();
const queryCents = z.coerce.number().int();
const queryBoolean = z.enum(['true', 'false']).transform((v) => v === 'true');

/** `:id` path parameter. */
export const idParamSchema = z.object({ id: queryId });
export type IdParam = z.infer<typeof idParamSchema>;

/** Body of routes that answer only with a count of rows they changed. */
export const changedCountResponseSchema = z.object({ changed: countSchema });
export type ChangedCountResponse = z.infer<typeof changedCountResponseSchema>;

// ---- GET /health ----

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string().min(1),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ---- Owners: GET /owners, PATCH /owners/:id ----

export const ownerListResponseSchema = z.array(ownerSchema);
export type OwnerListResponse = z.infer<typeof ownerListResponseSchema>;

export const updateOwnerRequestSchema = z.object({ name: ownerSchema.shape.name });
export type UpdateOwnerRequest = z.infer<typeof updateOwnerRequestSchema>;
export const updateOwnerResponseSchema = ownerSchema;

// ---- Session: POST /session, DELETE /session ----

export const createSessionRequestSchema = z.object({ ownerId: idSchema });
export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/** The active profile after the call; null after DELETE. */
export const sessionResponseSchema = z.object({ owner: ownerSchema.nullable() });
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

// ---- Accounts: GET, POST /accounts, PATCH /accounts/:id ----

export const accountListResponseSchema = z.array(accountSchema);
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;

export const createAccountRequestSchema = z.object({
  name: accountSchema.shape.name,
  institution: institutionSchema,
  type: accountTypeSchema,
  defaultOwnerId: idSchema,
  csvMapping: csvMappingSchema,
});
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;
export const createAccountResponseSchema = accountSchema;

export const updateAccountRequestSchema = createAccountRequestSchema
  .extend({ archived: z.boolean() })
  .partial();
export type UpdateAccountRequest = z.infer<typeof updateAccountRequestSchema>;
export const updateAccountResponseSchema = accountSchema;

// ---- GET /csv-presets ----

export const csvPresetSchema = z.object({
  id: csvPresetIdSchema,
  label: z.string().min(1),
  institution: institutionSchema,
  type: accountTypeSchema,
  mapping: csvMappingSchema,
});
export type CsvPreset = z.infer<typeof csvPresetSchema>;
export const csvPresetListResponseSchema = z.array(csvPresetSchema);
export type CsvPresetListResponse = z.infer<typeof csvPresetListResponseSchema>;

// ---- Imports ----

/** An import as the API returns it: the stored row without the raw file content. */
export const importSummarySchema = importSchema.omit({ rawCsv: true });
export type ImportSummary = z.infer<typeof importSummarySchema>;

export const previewRowStatusSchema = z.enum(['new', 'duplicate', 'skipped', 'error']);
export type PreviewRowStatus = z.infer<typeof previewRowStatusSchema>;

/**
 * One row of an import preview. Parsed fields are null on `error` rows and may be null on
 * `skipped` rows; `reason` explains every `skipped` and `error` row.
 */
export const previewRowSchema = z.object({
  /** 1-based line number in the file (for a legacy workbook, the sheet row). */
  line: z.int().positive(),
  status: previewRowStatusSchema,
  reason: z.string().nullable(),
  date: isoDateSchema.nullable(),
  postedDate: isoDateSchema.nullable(),
  amountCents: centsSchema.nullable(),
  description: z.string().nullable(),
  memo: z.string().nullable(),
  merchantKey: z.string().nullable(),
  bankCategory: z.string().nullable(),
  externalId: z.string().nullable(),
  dedupKey: z.string().nullable(),
  occurrence: z.int().positive().nullable(),
  /** The owner the row would get. */
  ownerId: idSchema.nullable(),
  /** The category a rule would assign (or, for a legacy row, the sheet's category). */
  categoryId: idSchema.nullable(),
  ruleId: idSchema.nullable(),
  raw: rawRowSchema,
});
export type PreviewRow = z.infer<typeof previewRowSchema>;

/** POST /imports/preview: multipart form with `file` and these text fields. */
export const importPreviewFormSchema = z.object({ accountId: queryId });
export type ImportPreviewForm = z.infer<typeof importPreviewFormSchema>;

export const importPreviewResponseSchema = z.object({
  import: importSummarySchema,
  rows: z.array(previewRowSchema),
  /** Earlier committed imports of a byte-identical file (same sha256): the re-upload warning. */
  sameFileImportIds: z.array(idSchema),
  /** Months (YYYY-MM) covered by this file that already hold legacy rows: informational note. */
  legacyOverlapMonths: z.array(yearMonthSchema),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;

/** POST /imports/:id/commit. Lines listed in `skipLines` (unticked in the preview) are not inserted. */
export const commitImportRequestSchema = z.object({
  skipLines: z.array(z.int().positive()).default([]),
});
export type CommitImportRequest = z.input<typeof commitImportRequestSchema>;
export const commitImportResponseSchema = importSummarySchema;

/** POST /imports/:id/undo */
export const undoImportResponseSchema = importSummarySchema;

/** GET /imports, newest first. */
export const importListResponseSchema = z.array(importSummarySchema);
export type ImportListResponse = z.infer<typeof importListResponseSchema>;

/** GET /imports/:id */
export const importDetailResponseSchema = z.object({
  import: importSummarySchema,
  /** Transactions of this import whose category was set by hand: lost on undo. */
  manuallyCategorizedCount: countSchema,
});
export type ImportDetailResponse = z.infer<typeof importDetailResponseSchema>;

/** A rule from the legacy format specification that a workbook cell breaks. */
export const legacyViolationSchema = z.object({
  sheet: z.string(),
  /** 1-based sheet row; null for a whole-workbook or whole-sheet rule. */
  row: z.int().positive().nullable(),
  /** Column letter; null when the rule is not about one column. */
  column: z.string().nullable(),
  rule: z.string().min(1),
  message: z.string().min(1),
});
export type LegacyViolation = z.infer<typeof legacyViolationSchema>;

export const legacyMonthTotalSchema = z.object({
  month: yearMonthSchema,
  count: countSchema,
  /** Raw sum of the sheet's Amount column in cents, as the sheet records it (spending positive). */
  sheetTotalCents: centsSchema,
});
export type LegacyMonthTotal = z.infer<typeof legacyMonthTotalSchema>;

/** POST /imports/legacy/preview: multipart `file` (.xlsx), no account. */
export const legacyPreviewResponseSchema = importPreviewResponseSchema.extend({
  monthTotals: z.array(legacyMonthTotalSchema),
  violations: z.array(legacyViolationSchema),
});
export type LegacyPreviewResponse = z.infer<typeof legacyPreviewResponseSchema>;

// ---- Transactions ----

export const transactionSortSchema = z.enum(['date', 'amount', 'description']);
export const sortOrderSchema = z.enum(['asc', 'desc']);

/** GET /transactions query string. */
export const transactionQuerySchema = z.object({
  owner: queryId.optional(),
  /** Account id, or `none` for legacy rows with no account. */
  account: z.union([z.literal('none'), queryId]).optional(),
  /** Category id, or `none` for uncategorized rows. */
  category: z.union([z.literal('none'), queryId]).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** Case-insensitive search over description, memo and notes. */
  q: z.string().trim().min(1).optional(),
  minCents: queryCents.optional(),
  maxCents: queryCents.optional(),
  /** Omitted = both excluded and included rows. */
  excluded: queryBoolean.optional(),
  sort: transactionSortSchema.default('date'),
  order: sortOrderSchema.default('desc'),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(50),
});
export type TransactionQuery = z.infer<typeof transactionQuerySchema>;

export const transactionListItemSchema = transactionSchema.extend({
  /** Present only with `category=none`. */
  suggestedCategoryId: idSchema.nullable().optional(),
});
export type TransactionListItem = z.infer<typeof transactionListItemSchema>;

export const transactionListResponseSchema = z.object({
  items: z.array(transactionListItemSchema),
  total: countSchema,
});
export type TransactionListResponse = z.infer<typeof transactionListResponseSchema>;

/**
 * PATCH /transactions/:id. Setting `categoryId` records `categorySource`, which defaults to
 * `manual`; `suggestion` marks an accepted suggestion.
 */
export const transactionPatchSchema = z
  .object({
    ownerId: idSchema,
    categoryId: idSchema.nullable(),
    categorySource: z.enum(['manual', 'suggestion']),
    notes: z.string().max(2000).nullable(),
    excluded: z.boolean(),
  })
  .partial();
export type TransactionPatch = z.infer<typeof transactionPatchSchema>;
export const updateTransactionResponseSchema = transactionSchema;

/** POST /transactions/bulk; responds with `changedCountResponseSchema`. */
export const bulkTransactionRequestSchema = z.object({
  ids: z.array(idSchema).min(1).max(1000),
  patch: transactionPatchSchema,
});
export type BulkTransactionRequest = z.infer<typeof bulkTransactionRequestSchema>;

// ---- Categories ----

export const categoryListResponseSchema = z.array(categorySchema);
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;

export const createCategoryRequestSchema = z.object({
  name: categorySchema.shape.name,
  kind: categoryKindSchema,
  color: hexColorSchema,
  groupName: categorySchema.shape.groupName,
  /** Defaults to after the last category. */
  sortOrder: z.int().optional(),
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;
export const createCategoryResponseSchema = categorySchema;

export const updateCategoryRequestSchema = z
  .object({
    name: categorySchema.shape.name,
    kind: categoryKindSchema,
    color: hexColorSchema,
    groupName: categorySchema.shape.groupName,
    sortOrder: z.int(),
    archived: z.boolean(),
  })
  .partial();
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;
export const updateCategoryResponseSchema = categorySchema;

/** DELETE /categories/:id archives; `reassignTo` moves its transactions first. */
export const archiveCategoryQuerySchema = z.object({ reassignTo: queryId.optional() });
export type ArchiveCategoryQuery = z.infer<typeof archiveCategoryQuerySchema>;
export const archiveCategoryResponseSchema = categorySchema;

// ---- Rules ----

export const ruleListResponseSchema = z.array(ruleSchema);
export type RuleListResponse = z.infer<typeof ruleListResponseSchema>;

/** A rule's editable fields: the body of POST /rules and POST /rules/test. */
export const ruleInputSchema = z.object({
  priority: z.int(),
  matchField: ruleMatchFieldSchema,
  matchType: ruleMatchTypeSchema,
  pattern: z.string().min(1),
  accountId: idSchema.nullable().default(null),
  direction: directionSchema.nullable().default(null),
  setCategoryId: idSchema,
  setOwnerId: idSchema.nullable().default(null),
  enabled: z.boolean().default(true),
});
export type RuleInput = z.input<typeof ruleInputSchema>;
export const createRuleRequestSchema = ruleInputSchema;
export const createRuleResponseSchema = ruleSchema;

export const updateRuleRequestSchema = z
  .object({
    priority: z.int(),
    matchField: ruleMatchFieldSchema,
    matchType: ruleMatchTypeSchema,
    pattern: z.string().min(1),
    accountId: idSchema.nullable(),
    direction: directionSchema.nullable(),
    setCategoryId: idSchema,
    setOwnerId: idSchema.nullable(),
    enabled: z.boolean(),
  })
  .partial();
export type UpdateRuleRequest = z.infer<typeof updateRuleRequestSchema>;
export const updateRuleResponseSchema = ruleSchema;

/** DELETE /rules/:id */
export const deleteRuleResponseSchema = z.object({ deletedId: idSchema });
export type DeleteRuleResponse = z.infer<typeof deleteRuleResponseSchema>;

/** POST /rules/test: an unsaved rule; returns its match count and up to 10 samples. */
export const testRuleRequestSchema = ruleInputSchema;
export const testRuleResponseSchema = z.object({
  matchCount: countSchema,
  samples: z.array(transactionSchema).max(10),
});
export type TestRuleResponse = z.infer<typeof testRuleResponseSchema>;

/** POST /rules/apply responds with `changedCountResponseSchema`. */

// ---- Reports ----

/** Owner filter: an owner id, or `all` for the whole household. */
const ownerFilter = z.union([z.literal('all'), queryId]);

export const reportGroupBySchema = z.enum(['category', 'group']);

/** GET /reports/monthly */
export const monthlyReportQuerySchema = z.object({
  from: yearMonthSchema,
  to: yearMonthSchema,
  owner: ownerFilter.default('all'),
  groupBy: reportGroupBySchema.default('category'),
});
export type MonthlyReportQuery = z.infer<typeof monthlyReportQuerySchema>;

/**
 * One month and one category (groupBy=category) or major category (groupBy=group).
 * The uncategorized bucket has `categoryId` and `groupName` both null. With groupBy=group,
 * `categoryId` is always null. Amounts follow PLAN.md section 2 conventions: spending and saved
 * are negated sums (a purchase counts positive), income is a plain sum.
 */
export const monthlyReportRowSchema = z.object({
  month: yearMonthSchema,
  categoryId: idSchema.nullable(),
  groupName: z.string().nullable(),
  spendingCents: centsSchema,
  incomeCents: centsSchema,
  savedCents: centsSchema,
  count: countSchema,
});
export type MonthlyReportRow = z.infer<typeof monthlyReportRowSchema>;

export const monthlyReportResponseSchema = z.object({ rows: z.array(monthlyReportRowSchema) });
export type MonthlyReportResponse = z.infer<typeof monthlyReportResponseSchema>;

/** GET /reports/compare */
export const compareReportQuerySchema = z.object({
  month: yearMonthSchema,
  owner: ownerFilter.default('all'),
});
export type CompareReportQuery = z.infer<typeof compareReportQuerySchema>;

/**
 * Per category, the amount in the category kind's own direction (spending, income or saved,
 * positive when normal). A comparison month with no transactions at all in the data is null,
 * not zero. The trailing average covers the three months before `month`, rounded to whole cents.
 */
export const compareReportRowSchema = z.object({
  categoryId: idSchema.nullable(),
  thisMonthCents: centsSchema,
  previousMonthCents: centsSchema.nullable(),
  sameMonthLastYearCents: centsSchema.nullable(),
  trailing3MonthAvgCents: centsSchema.nullable(),
});
export type CompareReportRow = z.infer<typeof compareReportRowSchema>;

export const compareReportResponseSchema = z.object({
  month: yearMonthSchema,
  rows: z.array(compareReportRowSchema),
});
export type CompareReportResponse = z.infer<typeof compareReportResponseSchema>;

// ---- Budgets (M9): GET, PUT /budgets ----

export const budgetListResponseSchema = z.array(budgetSchema);
export type BudgetListResponse = z.infer<typeof budgetListResponseSchema>;

/** PUT /budgets replaces every budget row with these. */
export const putBudgetsRequestSchema = z.object({
  budgets: z.array(budgetSchema.omit({ id: true })),
});
export type PutBudgetsRequest = z.infer<typeof putBudgetsRequestSchema>;
export const putBudgetsResponseSchema = budgetListResponseSchema;

// ---- Backups: POST /backup, GET /backup/latest (a file download, no JSON) ----

export const backupResponseSchema = z.object({
  filename: z.string().regex(/^finance-\d{8}-\d{6}\.sqlite$/),
  createdAt: timestampSchema,
  sizeBytes: countSchema,
});
export type BackupResponse = z.infer<typeof backupResponseSchema>;
