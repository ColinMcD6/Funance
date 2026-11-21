import { sha256Hex } from './sha256.js';

/** The fields of a parsed row that identify it for duplicate detection. */
export type DedupFields = {
  date: string;
  amountCents: number;
  description: string;
  externalId: string | null;
};

/**
 * PLAN.md section 2, "Duplicate detection": the bank's reference number when the file has one,
 * otherwise the SHA-256 hex of `date|amount_cents|DESCRIPTION` with the description uppercased
 * and its whitespace collapsed.
 */
export function dedupKey(row: DedupFields): string {
  if (row.externalId !== null && row.externalId !== '') return row.externalId;
  const description = row.description.toUpperCase().replace(/\s+/g, ' ').trim();
  return sha256Hex(`${row.date}|${row.amountCents}|${description}`);
}
