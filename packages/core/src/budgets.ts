import type { Budget } from '@funance/shared';

// Budget lookup shared by the server (validating PUT /budgets) and the web app (dashboard
// indicators). PLAN.md section 2, "budgets": a row applies from its `effective_from` month
// until a later row for the same category and owner replaces it. Months are 'YYYY-MM' strings;
// amounts are integer cents.

export type BudgetRow = Pick<
  Budget,
  'categoryId' | 'ownerId' | 'monthlyAmountCents' | 'effectiveFrom'
>;

/**
 * The amount of the latest row for exactly this category and owner (null = the household row)
 * at or before `month`; null when no such row starts by then.
 */
export function effectiveBudget(
  budgets: readonly BudgetRow[],
  categoryId: number,
  ownerId: number | null,
  month: string,
): number | null {
  let best: BudgetRow | null = null;
  for (const row of budgets) {
    if (row.categoryId !== categoryId || row.ownerId !== ownerId) continue;
    if (row.effectiveFrom > month) continue;
    if (best === null || row.effectiveFrom > best.effectiveFrom) best = row;
  }
  return best === null ? null : best.monthlyAmountCents;
}

/**
 * The budget a report view of one category and month is measured against:
 *
 * - one owner: that owner's own budget; a household budget does not apply to one owner,
 *   because nothing says how it would be shared out;
 * - everyone (`all`): the household budget when one is in effect, otherwise the sum of the
 *   owners' budgets in effect (so per-owner budgets still add up to a household figure).
 *
 * Null when no budget applies.
 */
export function budgetForView(
  budgets: readonly BudgetRow[],
  categoryId: number,
  owner: number | 'all',
  month: string,
): number | null {
  if (owner !== 'all') return effectiveBudget(budgets, categoryId, owner, month);
  const household = effectiveBudget(budgets, categoryId, null, month);
  if (household !== null) return household;
  const owners = new Set<number>();
  for (const row of budgets) {
    if (row.categoryId === categoryId && row.ownerId !== null) owners.add(row.ownerId);
  }
  let total: number | null = null;
  for (const ownerId of owners) {
    const cents = effectiveBudget(budgets, categoryId, ownerId, month);
    if (cents !== null) total = (total ?? 0) + cents;
  }
  return total;
}

export type BudgetStatus = {
  budgetCents: number;
  actualCents: number;
  /** Actual minus budget: positive is over budget, negative is under, zero is on budget. */
  differenceCents: number;
  /** Share of the budget used, in whole percent (rounded down); null for a zero budget. */
  percentUsed: number | null;
};

/** How `actualCents` (in its kind's own direction, positive when normal) stands against a budget. */
export function budgetStatus(actualCents: number, budgetCents: number): BudgetStatus {
  return {
    budgetCents,
    actualCents,
    differenceCents: actualCents - budgetCents,
    percentUsed: budgetCents === 0 ? null : Math.floor((actualCents * 100) / budgetCents),
  };
}

/**
 * The first pair of rows that share a category, owner and effective month, which would make the
 * lookup ambiguous; null when every row is distinct.
 */
export function duplicateBudget(budgets: readonly BudgetRow[]): [number, number] | null {
  const seen = new Map<string, number>();
  for (const [index, row] of budgets.entries()) {
    const key = `${row.categoryId}|${row.ownerId ?? 'household'}|${row.effectiveFrom}`;
    const first = seen.get(key);
    if (first !== undefined) return [first, index];
    seen.set(key, index);
  }
  return null;
}
