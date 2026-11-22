import type { CategoryKind, CompareReportRow, MonthlyReportRow } from '@funance/shared';

// Report maths shared by the server (GET /reports/compare) and the web app (dashboard totals).
// Months are 'YYYY-MM' strings; amounts are integer cents. PLAN.md section 2, "Conventions".

const MONTH = /^(\d{4})-(\d{2})$/;

/** `month` moved by `delta` months: addMonths('2026-01', -1) is '2025-12'. */
export function addMonths(month: string, delta: number): string {
  const match = MONTH.exec(month);
  if (match === null) throw new RangeError(`Expected a month as YYYY-MM, got ${month}`);
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + delta;
  const year = Math.floor(index / 12);
  const m = index - year * 12 + 1;
  return `${String(year).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
}

/** Every month from `from` to `to`, both included; empty when `from` is after `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const months: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
  return months;
}

/** The first and last day of `month`, for a `from`/`to` date filter. */
export function monthDateRange(month: string): { from: string; to: string } {
  const [year, m] = addMonths(month, 0).split('-').map(Number) as [number, number];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const lastDay = m === 2 ? (leap ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/**
 * A signed sum of `amount_cents` turned into its kind's own direction, positive when normal:
 * spending and saved are negated (a purchase counts positive, a refund reduces it), income is
 * kept as is. Uncategorized rows (kind null) count like spending. Transfers count nowhere: null.
 */
export function directedCents(kind: CategoryKind | null, sumCents: number): number | null {
  switch (kind) {
    case 'income':
      return sumCents;
    case 'transfer':
      return null;
    case 'expense':
    case 'savings':
    case null:
      // `0 - x` rather than `-x`, so a zero sum is 0, not -0.
      return 0 - sumCents;
  }
}

/** Integer division rounded half away from zero, so -0.5 cents rounds to -1, as 0.5 rounds to 1. */
export function divideRounded(total: number, divisor: number): number {
  const q = Math.round(Math.abs(total) / divisor);
  return total < 0 ? -q : q;
}

/** The average of whole-cent values, rounded to whole cents; null for no values. */
export function averageCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return divideRounded(
    values.reduce((a, b) => a + b, 0),
    values.length,
  );
}

export type ReportTotals = {
  incomeCents: number;
  spendingCents: number;
  savedCents: number;
  /** Income minus spending minus saved. */
  leftOverCents: number;
  /** The uncategorized bucket's amount, spending-signed (outflows positive); not in any total. */
  uncategorizedCents: number;
  uncategorizedCount: number;
};

/**
 * Dashboard totals over monthly report rows (any months, either grouping). The uncategorized
 * bucket (categoryId and groupName both null) is reported apart and is not part of spending,
 * so left over is exactly income minus spending minus saved.
 */
export function reportTotals(rows: readonly MonthlyReportRow[]): ReportTotals {
  const totals = {
    incomeCents: 0,
    spendingCents: 0,
    savedCents: 0,
    uncategorizedCents: 0,
    uncategorizedCount: 0,
  };
  for (const row of rows) {
    if (row.categoryId === null && row.groupName === null) {
      totals.uncategorizedCents += row.spendingCents;
      totals.uncategorizedCount += row.count;
      continue;
    }
    totals.incomeCents += row.incomeCents;
    totals.spendingCents += row.spendingCents;
    totals.savedCents += row.savedCents;
  }
  return {
    ...totals,
    leftOverCents: totals.incomeCents - totals.spendingCents - totals.savedCents,
  };
}

/** One category's amount in one month, already in its kind's direction (`directedCents`). */
export type CategoryMonthAmount = { month: string; categoryId: number | null; cents: number };

/**
 * Rows of GET /reports/compare for `month`. A comparison month missing from `monthsWithData`
 * is null (no data at all), not zero; a category with no rows in a month that has data is zero.
 * The trailing average covers the three months before `month` that have data, and is null when
 * none of them has. `categoryOrder` lists category ids in display order; any other id, and the
 * uncategorized bucket (null), follow it.
 */
export function buildCompareRows(
  month: string,
  amounts: readonly CategoryMonthAmount[],
  monthsWithData: ReadonlySet<string>,
  categoryOrder: readonly number[] = [],
): CompareReportRow[] {
  const previous = addMonths(month, -1);
  const lastYear = addMonths(month, -12);
  const trailing = [addMonths(month, -3), addMonths(month, -2), previous].filter((m) =>
    monthsWithData.has(m),
  );

  const byCategory = new Map<number | null, Map<string, number>>();
  for (const { month: m, categoryId, cents } of amounts) {
    let months = byCategory.get(categoryId);
    if (months === undefined) {
      months = new Map();
      byCategory.set(categoryId, months);
    }
    months.set(m, (months.get(m) ?? 0) + cents);
  }

  const amountIn = (months: Map<string, number>, m: string): number | null =>
    monthsWithData.has(m) ? (months.get(m) ?? 0) : null;

  const rank = (id: number | null): number => {
    if (id === null) return Number.MAX_SAFE_INTEGER;
    const i = categoryOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER - 1 : i;
  };
  const ids = [...byCategory.keys()].sort((a, b) => rank(a) - rank(b) || (a ?? 0) - (b ?? 0));

  return ids.map((categoryId) => {
    const months = byCategory.get(categoryId) ?? new Map<string, number>();
    return {
      categoryId,
      thisMonthCents: months.get(month) ?? 0,
      previousMonthCents: amountIn(months, previous),
      sameMonthLastYearCents: amountIn(months, lastYear),
      trailing3MonthAvgCents: averageCents(trailing.map((m) => months.get(m) ?? 0)),
    };
  });
}
