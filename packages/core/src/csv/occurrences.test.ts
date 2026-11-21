import { describe, expect, it } from 'vitest';
import { assignOccurrences } from './occurrences.js';
import type { ParsedOkRow, ParsedRow } from './parse-csv.js';

function row(line: number, dedupKey: string): ParsedOkRow {
  return {
    line,
    raw: {},
    status: 'parsed',
    date: '2026-10-01',
    postedDate: null,
    amountCents: -100,
    description: dedupKey,
    memo: null,
    merchantKey: dedupKey,
    bankCategory: null,
    externalId: null,
    dedupKey,
    ownerHint: null,
    ownerId: 1,
  };
}

const summary = (rows: ReturnType<typeof assignOccurrences>) =>
  rows.map((r) =>
    r.status === 'new' || r.status === 'duplicate' ? [r.status, r.occurrence] : [r.status],
  );

describe('assignOccurrences', () => {
  it('marks every row new against an empty account, numbering repeats', () => {
    const rows = [row(2, 'a'), row(3, 'b'), row(4, 'a')];
    expect(summary(assignOccurrences(rows, new Map()))).toEqual([
      ['new', 1],
      ['new', 1],
      ['new', 2],
    ]);
  });

  it('four identical rows against two existing gives two new, occurrences 3 and 4', () => {
    const rows = [row(2, 'x'), row(3, 'x'), row(4, 'x'), row(5, 'x')];
    expect(summary(assignOccurrences(rows, new Map([['x', 2]])))).toEqual([
      ['duplicate', 1],
      ['duplicate', 2],
      ['new', 3],
      ['new', 4],
    ]);
  });

  it('marks everything duplicate when the account has at least as many', () => {
    const rows = [row(2, 'x'), row(3, 'x')];
    expect(summary(assignOccurrences(rows, new Map([['x', 5]])))).toEqual([
      ['duplicate', 1],
      ['duplicate', 2],
    ]);
  });

  it('passes skipped and error rows through unchanged', () => {
    const skipped: ParsedRow = { line: 2, raw: {}, status: 'skipped', reason: 'Zero amount' };
    const error: ParsedRow = { line: 3, raw: {}, status: 'error', reason: 'Bad date' };
    const result = assignOccurrences([skipped, row(4, 'x'), error], new Map());
    expect(result[0]).toBe(skipped);
    expect(result[2]).toBe(error);
    expect(result[1]).toMatchObject({ status: 'new', occurrence: 1, line: 4 });
  });
});
