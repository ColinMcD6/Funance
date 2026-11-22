import type { MonthlyReportRow } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import {
  addMonths,
  averageCents,
  buildCompareRows,
  directedCents,
  divideRounded,
  monthDateRange,
  monthsBetween,
  reportTotals,
} from './reports.js';

describe('addMonths', () => {
  it.each([
    ['2026-01', -1, '2025-12'],
    ['2026-12', 1, '2027-01'],
    ['2026-03', -12, '2025-03'],
    ['2026-03', 0, '2026-03'],
    ['2026-03', -27, '2023-12'],
  ])('%s %+i is %s', (month, delta, expected) => {
    expect(addMonths(month, delta)).toBe(expected);
  });

  it('rejects text that is not a month', () => {
    expect(() => addMonths('2026-3', 1)).toThrow(RangeError);
  });
});

describe('monthsBetween', () => {
  it('lists every month, both ends included, across a year end', () => {
    expect(monthsBetween('2025-11', '2026-02')).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('is empty when from is after to', () => {
    expect(monthsBetween('2026-02', '2026-01')).toEqual([]);
  });
});

describe('monthDateRange', () => {
  it.each([
    ['2026-01', '2026-01-31'],
    ['2026-04', '2026-04-30'],
    ['2026-02', '2026-02-28'],
    ['2028-02', '2028-02-29'],
    ['2100-02', '2100-02-28'],
    ['2000-02', '2000-02-29'],
    ['2026-12', '2026-12-31'],
  ])('%s ends on %s', (month, last) => {
    expect(monthDateRange(month)).toEqual({ from: `${month}-01`, to: last });
  });
});

describe('directedCents', () => {
  it('negates spending, saved and uncategorized; keeps income; drops transfers', () => {
    expect(directedCents('expense', -5000)).toBe(5000);
    expect(directedCents('expense', 1200)).toBe(-1200);
    expect(directedCents('savings', -30000)).toBe(30000);
    expect(directedCents(null, -700)).toBe(700);
    expect(directedCents('income', 250000)).toBe(250000);
    expect(directedCents('transfer', -150000)).toBeNull();
  });

  it('never returns negative zero', () => {
    expect(Object.is(directedCents('expense', 0), 0)).toBe(true);
  });
});

describe('divideRounded and averageCents', () => {
  it('rounds half away from zero', () => {
    expect(divideRounded(5, 2)).toBe(3);
    expect(divideRounded(-5, 2)).toBe(-3);
    expect(divideRounded(10, 3)).toBe(3);
    expect(divideRounded(-10, 3)).toBe(-3);
  });

  it('averages whole cents and is null for nothing', () => {
    expect(averageCents([100, 200, 400])).toBe(233);
    expect(averageCents([100, 201])).toBe(151);
    expect(averageCents([])).toBeNull();
  });
});

function row(partial: Partial<MonthlyReportRow>): MonthlyReportRow {
  return {
    month: '2026-10',
    categoryId: 1,
    groupName: 'G',
    spendingCents: 0,
    incomeCents: 0,
    savedCents: 0,
    count: 1,
    ...partial,
  };
}

describe('reportTotals', () => {
  it('sums each kind, keeps uncategorized apart, and left over is income - spending - saved', () => {
    const totals = reportTotals([
      row({ categoryId: 1, spendingCents: 12000, count: 3 }),
      row({ categoryId: 2, spendingCents: 3000 }),
      row({ categoryId: 3, incomeCents: 400000 }),
      row({ categoryId: 4, savedCents: 50000 }),
      row({ categoryId: null, groupName: null, spendingCents: 2500, count: 2 }),
    ]);
    expect(totals).toEqual({
      incomeCents: 400000,
      spendingCents: 15000,
      savedCents: 50000,
      leftOverCents: 400000 - 15000 - 50000,
      uncategorizedCents: 2500,
      uncategorizedCount: 2,
    });
  });

  it('treats a group row (categoryId null, groupName set) as categorized', () => {
    const totals = reportTotals([row({ categoryId: null, groupName: 'Joy', spendingCents: 900 })]);
    expect(totals.spendingCents).toBe(900);
    expect(totals.uncategorizedCount).toBe(0);
  });

  it('is all zero for no rows', () => {
    expect(reportTotals([])).toEqual({
      incomeCents: 0,
      spendingCents: 0,
      savedCents: 0,
      leftOverCents: 0,
      uncategorizedCents: 0,
      uncategorizedCount: 0,
    });
  });
});

describe('buildCompareRows', () => {
  const allMonths = new Set(['2025-10', '2026-07', '2026-08', '2026-09', '2026-10']);

  it('fills this month, previous month, last year and the trailing average', () => {
    const rows = buildCompareRows(
      '2026-10',
      [
        { month: '2026-10', categoryId: 1, cents: 1000 },
        { month: '2026-09', categoryId: 1, cents: 900 },
        { month: '2026-08', categoryId: 1, cents: 600 },
        { month: '2026-07', categoryId: 1, cents: 301 },
        { month: '2025-10', categoryId: 1, cents: 800 },
      ],
      allMonths,
    );
    expect(rows).toEqual([
      {
        categoryId: 1,
        thisMonthCents: 1000,
        previousMonthCents: 900,
        sameMonthLastYearCents: 800,
        trailing3MonthAvgCents: 600, // (301 + 600 + 900) / 3 = 600.33
      },
    ]);
  });

  it('is null, not zero, for a comparison month with no data at all', () => {
    const rows = buildCompareRows(
      '2026-10',
      [{ month: '2026-10', categoryId: 1, cents: 1000 }],
      new Set(['2026-10']),
    );
    expect(rows[0]).toEqual({
      categoryId: 1,
      thisMonthCents: 1000,
      previousMonthCents: null,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: null,
    });
  });

  it('is zero for a category with no rows in a month that has other data', () => {
    const rows = buildCompareRows(
      '2026-10',
      [
        { month: '2026-09', categoryId: 1, cents: 900 },
        { month: '2026-10', categoryId: 2, cents: 50 },
      ],
      allMonths,
    );
    expect(rows).toEqual([
      {
        categoryId: 1,
        thisMonthCents: 0,
        previousMonthCents: 900,
        sameMonthLastYearCents: 0,
        trailing3MonthAvgCents: 300,
      },
      {
        categoryId: 2,
        thisMonthCents: 50,
        previousMonthCents: 0,
        sameMonthLastYearCents: 0,
        trailing3MonthAvgCents: 0,
      },
    ]);
  });

  it('averages only the trailing months that have data', () => {
    const rows = buildCompareRows(
      '2026-10',
      [
        { month: '2026-09', categoryId: 1, cents: 900 },
        { month: '2026-08', categoryId: 1, cents: 301 },
      ],
      new Set(['2026-08', '2026-09', '2026-10']),
    );
    expect(rows[0]?.trailing3MonthAvgCents).toBe(601); // (301 + 900) / 2 = 600.5
  });

  it('orders by the given category order, unknown ids next, uncategorized last', () => {
    const amounts = [null, 7, 3, 5].map((categoryId) => ({
      month: '2026-10',
      categoryId,
      cents: 1,
    }));
    const rows = buildCompareRows('2026-10', amounts, allMonths, [5, 3]);
    expect(rows.map((r) => r.categoryId)).toEqual([5, 3, 7, null]);
  });

  it('adds amounts given twice for the same category and month', () => {
    const rows = buildCompareRows(
      '2026-10',
      [
        { month: '2026-10', categoryId: 1, cents: 100 },
        { month: '2026-10', categoryId: 1, cents: -30 },
      ],
      allMonths,
    );
    expect(rows[0]?.thisMonthCents).toBe(70);
  });
});
