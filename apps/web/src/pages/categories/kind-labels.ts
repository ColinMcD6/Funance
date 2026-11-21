import type { CategoryKind } from '@funance/shared';

/** How each category kind is named on screen. */
export const KIND_LABELS: Record<CategoryKind, string> = {
  expense: 'Expense',
  income: 'Income',
  savings: 'Savings',
  transfer: 'Transfer (left out of totals)',
};

/** Short form for badges. */
export const KIND_BADGES: Record<CategoryKind, string> = {
  expense: 'Expense',
  income: 'Income',
  savings: 'Savings',
  transfer: 'Transfer',
};
