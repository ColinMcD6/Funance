import { z } from 'zod';

/** Auto-increment integer id. */
export const idSchema = z.int().positive();

/** Signed integer cents. Negative = money leaving the household. */
export const centsSchema = z.int();

/** Non-negative integer count. */
export const countSchema = z.int().nonnegative();

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** True when `value` is a real calendar date written as YYYY-MM-DD. */
export function isIsoDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const max = month === 2 && !isLeapYear(year) ? 28 : (DAYS_IN_MONTH[month - 1] ?? 0);
  return day <= max;
}

/** Date-only text, YYYY-MM-DD, no time zone. */
export const isoDateSchema = z
  .string()
  .refine(isIsoDate, { message: 'Expected a calendar date as YYYY-MM-DD' });

/** A calendar month, YYYY-MM. */
export const yearMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Expected a month as YYYY-MM' });

/** ISO 8601 UTC timestamp text, e.g. 2026-11-18T09:30:00.000Z. */
export const timestampSchema = z.iso.datetime();

/** Hex colour, #rrggbb. */
export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, { message: 'Expected a colour as #rrggbb' });

/** A raw source row as stored in `raw_row`: header-keyed for files with a header, else positional. */
export const rawRowSchema = z.union([z.record(z.string(), z.unknown()), z.array(z.unknown())]);
export type RawRow = z.infer<typeof rawRowSchema>;
