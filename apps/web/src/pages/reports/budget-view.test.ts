import type { BudgetRow } from '@funance/core/budgets';
import type { Category } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import { lineBudget } from './budget-view';

function category(id: number, name: string, groupName: string, kind: Category['kind'] = 'expense') {
  return { id, name, kind, color: '#16a34a', sortOrder: id, archived: false, groupName };
}

const CATEGORIES: Category[] = [
  category(1, 'Groceries', 'Groceries'),
  category(2, 'Coffee', 'Joy'),
  category(3, 'Eating out', 'Joy'),
  category(4, 'Income', 'Money', 'income'),
  category(5, 'Investing', 'Money', 'savings'),
  category(6, 'Debt Payments', 'Money'),
];

const BUDGETS: BudgetRow[] = [
  { categoryId: 1, ownerId: null, monthlyAmountCents: 60000, effectiveFrom: '2026-01' },
  { categoryId: 1, ownerId: null, monthlyAmountCents: 70000, effectiveFrom: '2026-06' },
  { categoryId: 2, ownerId: 1, monthlyAmountCents: 3000, effectiveFrom: '2026-01' },
  { categoryId: 2, ownerId: 2, monthlyAmountCents: 2000, effectiveFrom: '2026-01' },
  { categoryId: 3, ownerId: null, monthlyAmountCents: 15000, effectiveFrom: '2026-01' },
  { categoryId: 5, ownerId: null, monthlyAmountCents: 50000, effectiveFrom: '2026-01' },
  { categoryId: 6, ownerId: null, monthlyAmountCents: 40000, effectiveFrom: '2026-01' },
];

function line(fields: {
  categoryId: number | null | undefined;
  groupName?: string | null;
  section?: 'spending' | 'income' | 'saved';
  thisMonthCents: number;
}) {
  return { groupName: null, section: 'spending' as const, ...fields };
}

describe('lineBudget', () => {
  it('measures a category against the budget in effect that month: over is positive', () => {
    // October: the June row ($700) applies. Spent $745.50, so $45.50 over.
    expect(
      lineBudget(
        line({ categoryId: 1, thisMonthCents: 74550 }),
        BUDGETS,
        CATEGORIES,
        '2026-10',
        'all',
      ),
    ).toEqual({ budgetCents: 70000, actualCents: 74550, differenceCents: 4550, percentUsed: 106 });
    // March: the January row ($600) applies. Spent $450, so $150 under.
    expect(
      lineBudget(
        line({ categoryId: 1, thisMonthCents: 45000 }),
        BUDGETS,
        CATEGORIES,
        '2026-03',
        'all',
      ),
    ).toMatchObject({ budgetCents: 60000, differenceCents: -15000 });
  });

  it('uses the owner’s own budget for one owner and none of the household one', () => {
    const coffee = line({ categoryId: 2, thisMonthCents: 3500 });
    expect(lineBudget(coffee, BUDGETS, CATEGORIES, '2026-10', 2)).toMatchObject({
      budgetCents: 2000,
      differenceCents: 1500,
    });
    // Colin has no Groceries budget of his own.
    expect(
      lineBudget(line({ categoryId: 1, thisMonthCents: 100 }), BUDGETS, CATEGORIES, '2026-10', 1),
    ).toBeNull();
  });

  it('adds up the owners’ budgets for All when there is no household budget', () => {
    const coffee = line({ categoryId: 2, thisMonthCents: 4000 });
    expect(lineBudget(coffee, BUDGETS, CATEGORIES, '2026-10', 'all')).toMatchObject({
      budgetCents: 5000,
      differenceCents: -1000,
    });
  });

  it('is null before any budget starts, for a category with none, and for uncategorized', () => {
    expect(
      lineBudget(line({ categoryId: 1, thisMonthCents: 1 }), BUDGETS, CATEGORIES, '2025-12', 'all'),
    ).toBeNull();
    expect(
      lineBudget(
        line({ categoryId: 4, section: 'income', thisMonthCents: 1 }),
        BUDGETS,
        CATEGORIES,
        '2026-10',
        'all',
      ),
    ).toBeNull();
    expect(
      lineBudget(
        line({ categoryId: null, thisMonthCents: 1 }),
        BUDGETS,
        CATEGORIES,
        '2026-10',
        'all',
      ),
    ).toBeNull();
  });

  it('adds up a major category’s budgets within its own section only', () => {
    // Joy spending: Coffee 30 + 20 (no household row) + Eating out 150 = $200.
    const joy = line({ categoryId: undefined, groupName: 'Joy', thisMonthCents: 25000 });
    expect(lineBudget(joy, BUDGETS, CATEGORIES, '2026-10', 'all')).toMatchObject({
      budgetCents: 20000,
      differenceCents: 5000,
    });
    // Money spending is Debt Payments only ($400); Money saved is Investing only ($500).
    const moneySpending = line({
      categoryId: undefined,
      groupName: 'Money',
      thisMonthCents: 40000,
    });
    expect(lineBudget(moneySpending, BUDGETS, CATEGORIES, '2026-10', 'all')).toMatchObject({
      budgetCents: 40000,
      differenceCents: 0,
    });
    const moneySaved = line({
      categoryId: undefined,
      groupName: 'Money',
      section: 'saved',
      thisMonthCents: 60000,
    });
    expect(lineBudget(moneySaved, BUDGETS, CATEGORIES, '2026-10', 'all')).toMatchObject({
      budgetCents: 50000,
      differenceCents: 10000,
    });
    // No Income budget in the Money group.
    const moneyIncome = line({
      categoryId: undefined,
      groupName: 'Money',
      section: 'income',
      thisMonthCents: 1,
    });
    expect(lineBudget(moneyIncome, BUDGETS, CATEGORIES, '2026-10', 'all')).toBeNull();
  });
});
