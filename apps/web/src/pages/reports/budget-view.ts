import {
  budgetForView,
  budgetStatus,
  type BudgetRow,
  type BudgetStatus,
} from '@funance/core/budgets';
import type { Category, CategoryKind } from '@funance/shared';
import type { CompareLine, CompareSection, OwnerChoice } from './report-view';

// Budget indicators for the dashboard's category table (M9). Budgets are looked up per category
// with the effective-from rule in core; a major-category line adds up its categories' budgets.

function sectionOfKind(kind: CategoryKind): CompareSection | null {
  if (kind === 'expense') return 'spending';
  if (kind === 'income') return 'income';
  if (kind === 'savings') return 'saved';
  return null;
}

/**
 * The budget a table line is measured against for `month` and `owner`, and how this month
 * stands against it; null when no budget applies (and always for uncategorized).
 *
 * A category line uses its own budget. A major-category line adds up the budgets of its
 * categories in the same section, so a mixed group such as Money compares its spending only
 * with spending budgets; null when none of them has a budget.
 */
export function lineBudget(
  line: Pick<CompareLine, 'categoryId' | 'groupName' | 'section' | 'thisMonthCents'>,
  budgets: readonly BudgetRow[],
  categories: readonly Category[],
  month: string,
  owner: OwnerChoice,
): BudgetStatus | null {
  if (line.categoryId === null) return null;
  const ids =
    line.categoryId === undefined
      ? categories
          .filter((c) => c.groupName === line.groupName && sectionOfKind(c.kind) === line.section)
          .map((c) => c.id)
      : [line.categoryId];
  let total: number | null = null;
  for (const id of ids) {
    const cents = budgetForView(budgets, id, owner, month);
    if (cents !== null) total = (total ?? 0) + cents;
  }
  return total === null ? null : budgetStatus(line.thisMonthCents, total);
}
