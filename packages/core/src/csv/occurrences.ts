import type { ParsedErrorRow, ParsedOkRow, ParsedRow, ParsedSkippedRow } from './parse-csv.js';

/** A parsed row after comparison with the account's existing transactions. */
export type AssignedOkRow = Omit<ParsedOkRow, 'status'> & {
  status: 'new' | 'duplicate';
  /** 1-based index among rows of the account with the same dedup key. */
  occurrence: number;
};

export type AssignedRow = AssignedOkRow | ParsedSkippedRow | ParsedErrorRow;

/**
 * PLAN.md section 2, "Duplicate detection". Rows are grouped by `dedupKey` in file order. When
 * the file has n rows for a key and the account already has m, the first m are `duplicate`
 * (occurrences 1 to m, matching the stored rows) and the rest are `new`, numbered m+1 to n.
 * Skipped and error rows pass through unchanged.
 *
 * `existingCountsByKey` holds, per dedup key, how many transactions the account already has.
 */
export function assignOccurrences(
  parsedRows: readonly ParsedRow[],
  existingCountsByKey: ReadonlyMap<string, number>,
): AssignedRow[] {
  const seen = new Map<string, number>();
  return parsedRows.map((row): AssignedRow => {
    if (row.status !== 'parsed') return row;
    const occurrence = (seen.get(row.dedupKey) ?? 0) + 1;
    seen.set(row.dedupKey, occurrence);
    const existing = existingCountsByKey.get(row.dedupKey) ?? 0;
    return { ...row, status: occurrence <= existing ? 'duplicate' : 'new', occurrence };
  });
}
