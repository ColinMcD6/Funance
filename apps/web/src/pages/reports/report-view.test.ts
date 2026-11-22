import type { Category, CompareReportRow, MonthlyReportRow } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import {
  compactDollars,
  compareLines,
  lastCompleteMonth,
  localToday,
  monthLabel,
  parseReportSearch,
  shortMonthLabel,
  spendingBreakdown,
  spendingTrend,
  toReportSearch,
  transactionsLink,
  trendMonths,
} from './report-view';

function category(
  id: number,
  name: string,
  groupName: string,
  kind: Category['kind'] = 'expense',
): Category {
  return { id, name, kind, color: `#00000${id}`, sortOrder: id, archived: false, groupName };
}

const CATEGORIES = [
  category(1, 'Groceries', 'Groceries'),
  category(2, 'Coffee', 'Joy'),
  category(3, 'Eating out', 'Joy'),
  category(4, 'Income', 'Money', 'income'),
  category(5, 'Investing', 'Money', 'savings'),
  category(6, 'Debt Payments', 'Money'),
];

function row(partial: Partial<MonthlyReportRow>): MonthlyReportRow {
  return {
    month: '2026-10',
    categoryId: null,
    groupName: null,
    spendingCents: 0,
    incomeCents: 0,
    savedCents: 0,
    count: 1,
    ...partial,
  };
}

describe('report URL state', () => {
  const defaults = { month: '2026-10', owner: 1 } as const;

  it('falls back to the defaults', () => {
    expect(parseReportSearch(new URLSearchParams(), defaults)).toEqual({
      month: '2026-10',
      owner: 1,
      groupBy: 'category',
      span: 12,
    });
    expect(
      parseReportSearch(new URLSearchParams('month=2026-13&owner=x&span=7'), defaults),
    ).toEqual({ month: '2026-10', owner: 1, groupBy: 'category', span: 12 });
  });

  it('round-trips every field', () => {
    const view = { month: '2025-03', owner: 'all', groupBy: 'group', span: 24 } as const;
    expect(parseReportSearch(toReportSearch(view), defaults)).toEqual(view);
    expect(toReportSearch({ ...view, owner: 2, groupBy: 'category', span: 12 }).toString()).toBe(
      'month=2025-03&owner=2',
    );
  });

  it('opens on the month before today', () => {
    expect(lastCompleteMonth('2026-11-21')).toBe('2026-10');
    expect(lastCompleteMonth('2026-01-01')).toBe('2025-12');
    expect(localToday(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('transactionsLink', () => {
  it('filters to the category, the whole month, the owner and rows not excluded', () => {
    const link = transactionsLink({ categoryId: 4, from: '2026-02', to: '2026-02', owner: 2 });
    const params = new URLSearchParams(link.split('?')[1]);
    expect(link.startsWith('/transactions?')).toBe(true);
    expect(Object.fromEntries(params)).toEqual({
      owner: '2',
      category: '4',
      from: '2026-02-01',
      to: '2026-02-28',
      excluded: 'false',
    });
  });

  it('uses category=none for uncategorized and no owner for All', () => {
    const params = new URLSearchParams(
      transactionsLink({ categoryId: null, from: '2026-09', to: '2026-10', owner: 'all' }).split(
        '?',
      )[1],
    );
    expect(params.get('category')).toBe('none');
    expect(params.get('owner')).toBeNull();
    expect(params.get('from')).toBe('2026-09-01');
    expect(params.get('to')).toBe('2026-10-31');
  });
});

describe('labels', () => {
  it('names months', () => {
    expect(monthLabel('2026-10')).toBe('October 2026');
    expect(shortMonthLabel('2026-01')).toBe('Jan 26');
  });

  it.each([
    [0, '$0'],
    [4549, '$45'],
    [-4550, '-$46'],
    [100000, '$1k'],
    [123456, '$1.2k'],
    [-2500000, '-$25k'],
  ])('compactDollars(%i) is %s', (cents, text) => {
    expect(compactDollars(cents)).toBe(text);
  });

  it('gives the trend window', () => {
    expect(trendMonths('2026-10', 12)).toEqual({ from: '2025-11', to: '2026-10' });
    expect(trendMonths('2026-10', 24)).toEqual({ from: '2024-11', to: '2026-10' });
  });
});

describe('spendingBreakdown', () => {
  it('orders spending largest first, includes uncategorized, drops income, saved and net refunds', () => {
    const bars = spendingBreakdown(
      [
        row({ categoryId: 1, groupName: 'Groceries', spendingCents: 18500 }),
        row({ categoryId: 2, groupName: 'Joy', spendingCents: 500 }),
        row({ categoryId: 3, groupName: 'Joy', spendingCents: -200 }),
        row({ categoryId: 4, groupName: 'Money', incomeCents: 500000 }),
        row({ categoryId: 5, groupName: 'Money', savedCents: 50000 }),
        row({ spendingCents: 3200 }),
      ],
      CATEGORIES,
    );
    expect(bars.map((b) => [b.label, b.cents, b.categoryId])).toEqual([
      ['Groceries', 18500, 1],
      ['Uncategorized', 3200, null],
      ['Coffee', 500, 2],
    ]);
  });

  it('labels group rows by major category, with no category to drill into', () => {
    const [bar] = spendingBreakdown([row({ groupName: 'Joy', spendingCents: 3500 })], CATEGORIES);
    expect(bar).toMatchObject({ label: 'Joy', categoryId: undefined, color: '#000002' });
  });
});

describe('spendingTrend', () => {
  it('zero-fills every month and keeps expense buckets in display order', () => {
    const { points, buckets } = spendingTrend(
      [
        row({ month: '2026-09', categoryId: 3, groupName: 'Joy', spendingCents: 700 }),
        row({ month: '2026-10', categoryId: 1, groupName: 'Groceries', spendingCents: 900 }),
        row({ month: '2026-10', categoryId: 4, groupName: 'Money', incomeCents: 100 }),
        row({ month: '2026-10', spendingCents: 50 }),
      ],
      ['2026-08', '2026-09', '2026-10'],
      CATEGORIES,
    );
    expect(buckets.map((b) => b.label)).toEqual(['Groceries', 'Eating out', 'Uncategorized']);
    expect(points).toEqual([
      { month: '2026-08', c1: 0, c3: 0, none: 0 },
      { month: '2026-09', c1: 0, c3: 700, none: 0 },
      { month: '2026-10', c1: 900, c3: 0, none: 50 },
    ]);
  });
});

describe('compareLines', () => {
  const rows: CompareReportRow[] = [
    {
      categoryId: 4,
      thisMonthCents: 500000,
      previousMonthCents: 200000,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 200000,
    },
    {
      categoryId: 2,
      thisMonthCents: 500,
      previousMonthCents: 0,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 100,
    },
    {
      categoryId: 3,
      thisMonthCents: 3000,
      previousMonthCents: 1000,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 900,
    },
    {
      categoryId: null,
      thisMonthCents: 3200,
      previousMonthCents: 0,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 0,
    },
    {
      categoryId: 5,
      thisMonthCents: 50000,
      previousMonthCents: 0,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 0,
    },
    {
      categoryId: 6,
      thisMonthCents: 20000,
      previousMonthCents: 0,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 0,
    },
  ];

  it('sorts by section then display order, uncategorized last in spending', () => {
    const lines = compareLines(rows, CATEGORIES, 'category');
    expect(lines.map((l) => [l.section, l.label])).toEqual([
      ['spending', 'Coffee'],
      ['spending', 'Eating out'],
      ['spending', 'Debt Payments'],
      ['spending', 'Uncategorized'],
      ['income', 'Income'],
      ['saved', 'Investing'],
    ]);
  });

  it('adds categories of a major category within one section, keeping nulls null', () => {
    const lines = compareLines(rows, CATEGORIES, 'group');
    expect(lines.map((l) => [l.section, l.label, l.thisMonthCents])).toEqual([
      ['spending', 'Joy', 3500],
      ['spending', 'Money', 20000],
      ['spending', 'Uncategorized', 3200],
      ['income', 'Money', 500000],
      ['saved', 'Money', 50000],
    ]);
    const joy = lines[0];
    expect(joy).toMatchObject({
      previousMonthCents: 1000,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 1000,
      categoryId: undefined,
    });
  });
});
