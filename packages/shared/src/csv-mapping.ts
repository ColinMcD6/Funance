import { z } from 'zod';
import { idSchema } from './primitives.js';

export const csvEncodingSchema = z.enum(['utf-8', 'latin1']);
export const csvDateFormatSchema = z.enum(['MM/dd/yyyy', 'M/d/yyyy', 'yyyy-MM-dd', 'dd/MM/yyyy']);
export const amountSignSchema = z.enum(['negative_is_outflow', 'positive_is_outflow']);

const columnName = z.string().min(1);

/**
 * How one account's CSV export maps onto transactions (PLAN.md section 2, "CSV mapping").
 * Column names are header names when `hasHeader` is true.
 */
export const csvMappingSchema = z
  .object({
    /** A BOM is always stripped. */
    encoding: csvEncodingSchema,
    /** Header names are trimmed before matching. */
    hasHeader: z.boolean(),
    columns: z.object({
      date: columnName,
      postedDate: columnName.optional(),
      /** Non-empty values joined with one space. */
      description: z.array(columnName).min(1),
      memo: columnName.optional(),
      /** One signed column, OR `outflow` and `inflow`. */
      amount: columnName.optional(),
      outflow: columnName.optional(),
      inflow: columnName.optional(),
      externalId: columnName.optional(),
      bankCategory: columnName.optional(),
      /** e.g. name on card */
      ownerHint: columnName.optional(),
      /** For files holding several accounts. */
      accountFilter: columnName.optional(),
    }),
    dateFormat: csvDateFormatSchema,
    /** Applies to the single `amount` column. */
    amountSign: amountSignSchema,
    /** One capture group, applied to the bankCategory column. */
    bankCategoryRegex: z.string().min(1).optional(),
    /** Column value -> owner id. */
    ownerHintMap: z.record(z.string(), idSchema).optional(),
    accountFilterValue: z.string().optional(),
    skipZeroAmount: z.boolean(),
    skipWhen: z
      .array(
        z.object({
          column: columnName,
          notEquals: z.string().optional(),
          matches: z.string().optional(),
        }),
      )
      .optional(),
  })
  .refine(
    (m) =>
      m.columns.amount !== undefined ||
      (m.columns.outflow !== undefined && m.columns.inflow !== undefined),
    { message: 'Map either an amount column, or both outflow and inflow', path: ['columns'] },
  );
export type CsvMapping = z.infer<typeof csvMappingSchema>;

export const csvPresetIdSchema = z.enum([
  'tangerine-chequing',
  'tangerine-mastercard',
  'simplii',
  'walmart-mastercard',
  'rbc',
]);
export type CsvPresetId = z.infer<typeof csvPresetIdSchema>;
