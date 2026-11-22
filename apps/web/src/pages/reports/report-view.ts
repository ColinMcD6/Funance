import { addMonths, monthDateRange } from '@funance/core/reports';
import {
  transactionQuerySchema,
  type Category,
  type CategoryKind,
  type CompareReportRow,
  type MonthlyReportRow,
} from '@funance/shared';
import { toTransactionSearch } from '@/pages/transactions/transaction-filters';

// What the Dashboard and Trends pages show, kept in the URL (month, owner, grouping, span), and
// the pure helpers that turn report rows into chart and table data.

export type GroupBy = 'category' | 'group';
export type OwnerChoice = number | 'all';
export type Span = 12 | 24;

export type ReportView = {
  month: string;
  owner: OwnerChoice;
  groupBy: GroupBy;
  span: Span;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month before the one `today` (YYYY-MM-DD) falls in: the most recent complete month. */
export function lastCompleteMonth(today: string): string {
  return addMonths(today.slice(0, 7), -1);
}

/** Today's date in the browser's time zone, as YYYY-MM-DD. */
export function localToday(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The view a URL asks for; missing or invalid values fall back to `defaults`. */
export function parseReportSearch(
  params: URLSearchParams,
  defaults: { month: string; owner: OwnerChoice },
): ReportView {
  const month = params.get('month') ?? '';
  const owner = params.get('owner') ?? '';
  const ownerId = Number(owner);
  return {
    month: MONTH.test(month) ? month : defaults.month,
    owner:
      owner === 'all'
        ? 'all'
        : Number.isSafeInteger(ownerId) && ownerId > 0
          ? ownerId
          : defaults.owner,
    groupBy: params.get('groupBy') === 'group' ? 'group' : 'category',
    span: params.get('span') === '24' ? 24 : 12,
  };
}

/** URL parameters for `view`; grouping and span are left out at their defaults. */
export function toReportSearch(view: ReportView): URLSearchParams {
  const params = new URLSearchParams({ month: view.month, owner: String(view.owner) });
  if (view.groupBy === 'group') params.set('groupBy', 'group');
  if (view.span === 24) params.set('span', '24');
  return params;
}

/**
 * The Transactions page filtered to what a report figure counts: one category (null for
 * uncategorized), the months `from` to `to`, the owner, and only rows not excluded.
 */
export function transactionsLink(target: {
  categoryId: number | null;
  from: string;
  to: string;
  owner: OwnerChoice;
}): string {
  const query = transactionQuerySchema.parse({
    category: target.categoryId === null ? 'none' : String(target.categoryId),
    from: monthDateRange(target.from).from,
    to: monthDateRange(target.to).to,
    owner: target.owner === 'all' ? undefined : String(target.owner),
    excluded: 'false',
  });
  return `/transactions?${toTransactionSearch(query).toString()}`;
}

/** 'October 2026' */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const names = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];
  return `${names[Number(m) - 1] ?? m} ${year}`;
}

/** 'Oct 26', for chart axes. */
export function shortMonthLabel(month: string): string {
  return `${monthLabel(month).slice(0, 3)} ${month.slice(2, 4)}`;
}

/** A short axis label for cents: '$0', '$45', '$1.2k', '-$3k'. Display only, rounded. */
export function compactDollars(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const dollars = Math.round(Math.abs(cents) / 100);
  if (dollars < 1000) return `${sign}$${dollars}`;
  const tenths = Math.round(dollars / 100);
  const text =
    tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)}.${tenths % 10}`;
  return `${sign}$${text}k`;
}

export const UNCATEGORIZED_COLOR = '#9ca3af';

/** One line of a chart or table: a category, a major category, or the uncategorized bucket. */
export type Bucket = {
  key: string;
  label: string;
  color: string;
  /** Kind of the category; for a group, of its first category; null for uncategorized. */
  kind: CategoryKind | null;
  /** The category to drill into; null for uncategorized; undefined for a group (no filter). */
  categoryId: number | null | undefined;
  groupName: string | null;
};

const UNCATEGORIZED: Bucket = {
  key: 'none',
  label: 'Uncategorized',
  color: UNCATEGORIZED_COLOR,
  kind: null,
  categoryId: null,
  groupName: null,
};

/** The bucket a report row belongs to. */
export function bucketOf(
  row: Pick<MonthlyReportRow, 'categoryId' | 'groupName'>,
  categories: readonly Category[],
): Bucket {
  if (row.categoryId !== null) {
    const category = categories.find((c) => c.id === row.categoryId);
    return {
      key: `c${row.categoryId}`,
      label: category?.name ?? `Category ${row.categoryId}`,
      color: category?.color ?? UNCATEGORIZED_COLOR,
      kind: category?.kind ?? 'expense',
      categoryId: row.categoryId,
      groupName: category?.groupName ?? null,
    };
  }
  if (row.groupName === null) return UNCATEGORIZED;
  const first = categories.find((c) => c.groupName === row.groupName);
  return {
    key: `g${row.groupName}`,
    label: row.groupName,
    color: first?.color ?? UNCATEGORIZED_COLOR,
    kind: first?.kind ?? 'expense',
    categoryId: undefined,
    groupName: row.groupName,
  };
}

/** Display rank of a bucket: category order, groups by their first category, uncategorized last. */
function rankOf(bucket: Bucket, categories: readonly Category[]): number {
  if (bucket.key === UNCATEGORIZED.key) return Number.MAX_SAFE_INTEGER;
  const index = categories.findIndex((c) =>
    bucket.categoryId === undefined ? c.groupName === bucket.groupName : c.id === bucket.categoryId,
  );
  return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index;
}

export type BreakdownBar = Bucket & { cents: number };

/**
 * Spending per bucket over `rows` (one month for the dashboard), largest first. Buckets with no
 * spending, or with refunds outweighing purchases, are left out of the chart.
 */
export function spendingBreakdown(
  rows: readonly MonthlyReportRow[],
  categories: readonly Category[],
): BreakdownBar[] {
  const bars = new Map<string, BreakdownBar>();
  for (const row of rows) {
    const bucket = bucketOf(row, categories);
    const bar = bars.get(bucket.key) ?? { ...bucket, cents: 0 };
    bar.cents += row.spendingCents;
    bars.set(bucket.key, bar);
  }
  return [...bars.values()]
    .filter((bar) => bar.cents > 0)
    .sort((a, b) => b.cents - a.cents || a.label.localeCompare(b.label));
}

/** One month of a stacked chart: `month` plus cents per bucket key. */
export type TrendPoint = { month: string } & Record<string, number | string>;

/**
 * Data for the Trends charts: one point per month in `months` (zero-filled), with each bucket's
 * spending in cents, and the buckets that have any spending in display order.
 */
export function spendingTrend(
  rows: readonly MonthlyReportRow[],
  months: readonly string[],
  categories: readonly Category[],
): { points: TrendPoint[]; buckets: Bucket[] } {
  const buckets = new Map<string, Bucket>();
  const cents = new Map<string, number>();
  for (const row of rows) {
    // spendingCents already holds only expense and uncategorized amounts, so no kind check here:
    // a major category's kind is its first category's, which says nothing about a mixed group.
    if (row.spendingCents === 0) continue;
    const bucket = bucketOf(row, categories);
    buckets.set(bucket.key, bucket);
    const key = `${row.month}|${bucket.key}`;
    cents.set(key, (cents.get(key) ?? 0) + row.spendingCents);
  }
  const ordered = [...buckets.values()].sort(
    (a, b) => rankOf(a, categories) - rankOf(b, categories),
  );
  const points = months.map((month) => {
    const point: TrendPoint = { month };
    for (const bucket of ordered) point[bucket.key] = cents.get(`${month}|${bucket.key}`) ?? 0;
    return point;
  });
  return { points, buckets: ordered };
}

export type CompareSection = 'spending' | 'income' | 'saved';

export type CompareLine = Bucket & {
  section: CompareSection;
  thisMonthCents: number;
  previousMonthCents: number | null;
  sameMonthLastYearCents: number | null;
  trailing3MonthAvgCents: number | null;
};

function sectionOf(kind: CategoryKind | null): CompareSection {
  if (kind === 'income') return 'income';
  if (kind === 'savings') return 'saved';
  return 'spending';
}

function addNullable(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : a + b;
}

/**
 * Table lines for the dashboard from GET /reports/compare. With groupBy=group, categories of a
 * major category that share a section are added together (a comparison stays null when it is
 * null, which happens for a whole month at once). Ordered by section, then display order.
 */
export function compareLines(
  rows: readonly CompareReportRow[],
  categories: readonly Category[],
  groupBy: GroupBy,
): CompareLine[] {
  const lines = new Map<string, CompareLine>();
  for (const row of rows) {
    const category = bucketOf({ categoryId: row.categoryId, groupName: null }, categories);
    const section = sectionOf(category.kind);
    const bucket =
      groupBy === 'group' && category.groupName !== null
        ? bucketOf({ categoryId: null, groupName: category.groupName }, categories)
        : category;
    const key = `${section}|${bucket.key}`;
    const line = lines.get(key);
    if (line === undefined) {
      lines.set(key, { ...bucket, ...row, categoryId: bucket.categoryId, section });
      continue;
    }
    line.thisMonthCents += row.thisMonthCents;
    line.previousMonthCents = addNullable(line.previousMonthCents, row.previousMonthCents);
    line.sameMonthLastYearCents = addNullable(
      line.sameMonthLastYearCents,
      row.sameMonthLastYearCents,
    );
    line.trailing3MonthAvgCents = addNullable(
      line.trailing3MonthAvgCents,
      row.trailing3MonthAvgCents,
    );
  }
  const sections: CompareSection[] = ['spending', 'income', 'saved'];
  return [...lines.values()].sort(
    (a, b) =>
      sections.indexOf(a.section) - sections.indexOf(b.section) ||
      rankOf(a, categories) - rankOf(b, categories),
  );
}

/** The months a Trends chart covers: `span` months ending with `month`. */
export function trendMonths(month: string, span: Span): { from: string; to: string } {
  return { from: addMonths(month, 1 - span), to: month };
}
