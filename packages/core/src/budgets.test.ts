import { describe, expect, it } from 'vitest';
import {
  budgetForView,
  budgetStatus,
  duplicateBudget,
  effectiveBudget,
  type BudgetRow,
} from './budgets.js';

const GROCERIES = 1;
const COFFEE = 2;
const COLIN = 1;
const EMILY = 2;

function row(
  categoryId: number,
  ownerId: number | null,
  effectiveFrom: string,
  monthlyAmountCents: number,
): BudgetRow {
  return { categoryId, ownerId, effectiveFrom, monthlyAmountCents };
}

describe('effectiveBudget', () => {
  // Out of order on purpose: the lookup must not depend on row order.
  const budgets = [
    row(GROCERIES, null, '2026-06', 100000),
    row(GROCERIES, null, '2026-01', 80000),
    row(GROCERIES, null, '2026-09', 90000),
    row(GROCERIES, COLIN, '2026-03', 20000),
  ];

  it('is null before the first row starts', () => {
    expect(effectiveBudget(budgets, GROCERIES, null, '2025-12')).toBeNull();
  });

  it('applies a row from its own month', () => {
    expect(effectiveBudget(budgets, GROCERIES, null, '2026-01')).toBe(80000);
    expect(effectiveBudget(budgets, GROCERIES, null, '2026-06')).toBe(100000);
  });

  it('keeps applying the latest row at or before the month until a later one starts', () => {
    expect(effectiveBudget(budgets, GROCERIES, null, '2026-05')).toBe(80000);
    expect(effectiveBudget(budgets, GROCERIES, null, '2026-08')).toBe(100000);
    expect(effectiveBudget(budgets, GROCERIES, null, '2027-04')).toBe(90000);
  });

  it('compares across a year boundary', () => {
    const rows = [row(GROCERIES, null, '2025-12', 1), row(GROCERIES, null, '2026-01', 2)];
    expect(effectiveBudget(rows, GROCERIES, null, '2025-12')).toBe(1);
    expect(effectiveBudget(rows, GROCERIES, null, '2026-02')).toBe(2);
  });

  it('keeps household and owner rows apart', () => {
    expect(effectiveBudget(budgets, GROCERIES, COLIN, '2026-02')).toBeNull();
    expect(effectiveBudget(budgets, GROCERIES, COLIN, '2026-10')).toBe(20000);
    expect(effectiveBudget(budgets, GROCERIES, EMILY, '2026-10')).toBeNull();
    expect(effectiveBudget(budgets, COFFEE, null, '2026-10')).toBeNull();
  });
});

describe('budgetForView', () => {
  it('uses only the owner’s own budget for one owner, never the household one', () => {
    const budgets = [
      row(GROCERIES, null, '2026-01', 80000),
      row(GROCERIES, EMILY, '2026-01', 30000),
    ];
    expect(budgetForView(budgets, GROCERIES, EMILY, '2026-10')).toBe(30000);
    expect(budgetForView(budgets, GROCERIES, COLIN, '2026-10')).toBeNull();
  });

  it('uses the household budget for everyone when one is in effect', () => {
    const budgets = [
      row(GROCERIES, null, '2026-01', 80000),
      row(GROCERIES, COLIN, '2026-01', 20000),
      row(GROCERIES, EMILY, '2026-01', 30000),
    ];
    expect(budgetForView(budgets, GROCERIES, 'all', '2026-10')).toBe(80000);
  });

  it('adds up the owners’ budgets in effect when there is no household budget', () => {
    const budgets = [
      row(COFFEE, COLIN, '2026-01', 4000),
      row(COFFEE, COLIN, '2026-07', 5000),
      row(COFFEE, EMILY, '2026-05', 3000),
    ];
    // February: only Colin's first row. June: Colin 40 + Emily 30. August: Colin 50 + Emily 30.
    expect(budgetForView(budgets, COFFEE, 'all', '2026-02')).toBe(4000);
    expect(budgetForView(budgets, COFFEE, 'all', '2026-06')).toBe(7000);
    expect(budgetForView(budgets, COFFEE, 'all', '2026-08')).toBe(8000);
    expect(budgetForView(budgets, COFFEE, 'all', '2025-12')).toBeNull();
  });

  it('falls back to the owners only for months before the household budget starts', () => {
    const budgets = [row(COFFEE, COLIN, '2026-01', 4000), row(COFFEE, null, '2026-06', 10000)];
    expect(budgetForView(budgets, COFFEE, 'all', '2026-03')).toBe(4000);
    expect(budgetForView(budgets, COFFEE, 'all', '2026-06')).toBe(10000);
  });

  it('is null for a category with no budget', () => {
    expect(
      budgetForView([row(GROCERIES, null, '2026-01', 1)], COFFEE, 'all', '2026-10'),
    ).toBeNull();
  });
});

describe('budgetStatus', () => {
  it('is positive when over budget', () => {
    expect(budgetStatus(12000, 10000)).toEqual({
      budgetCents: 10000,
      actualCents: 12000,
      differenceCents: 2000,
      percentUsed: 120,
    });
  });

  it('is negative when under budget', () => {
    expect(budgetStatus(2550, 10000)).toMatchObject({ differenceCents: -7450, percentUsed: 25 });
  });

  it('is zero on budget, and a refund-heavy month goes below zero spending', () => {
    expect(budgetStatus(10000, 10000).differenceCents).toBe(0);
    expect(budgetStatus(-500, 10000)).toMatchObject({ differenceCents: -10500, percentUsed: -5 });
  });

  it('has no percentage for a zero budget', () => {
    expect(budgetStatus(300, 0)).toMatchObject({ differenceCents: 300, percentUsed: null });
  });
});

describe('duplicateBudget', () => {
  it('finds two rows for the same category, owner and month', () => {
    expect(
      duplicateBudget([
        row(GROCERIES, null, '2026-01', 1),
        row(GROCERIES, COLIN, '2026-01', 2),
        row(GROCERIES, null, '2026-02', 3),
        row(GROCERIES, null, '2026-01', 4),
      ]),
    ).toEqual([0, 3]);
  });

  it('is null when every row is distinct', () => {
    expect(
      duplicateBudget([row(GROCERIES, null, '2026-01', 1), row(COFFEE, null, '2026-01', 1)]),
    ).toBeNull();
  });
});
