import { duplicateBudget, type BudgetRow } from '@funance/core/budgets';
import type { Budget, Category } from '@funance/shared';
import { centsToDollarText, parseDollars } from '@/pages/transactions/dollars';

// The Budgets page edits every budget row as a draft and saves them all with one PUT, which
// replaces the stored rows (PLAN.md section 2, "budgets"; M1 contract).

export type DraftRow = {
  /** Stable React key; not sent to the server. */
  key: string;
  categoryId: number;
  /** Null = whole household. */
  ownerId: number | null;
  /** 'YYYY-MM' */
  effectiveFrom: string;
  /** Dollars as typed, e.g. '650' or '650.00'. */
  amount: string;
};

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

let nextKey = 0;
function newKey(): string {
  nextKey += 1;
  return `draft-${String(nextKey)}`;
}

/** Draft rows for the stored budgets, in the server's order. */
export function toDraft(budgets: readonly Budget[]): DraftRow[] {
  return budgets.map((b) => ({
    key: `budget-${String(b.id)}`,
    categoryId: b.categoryId,
    ownerId: b.ownerId,
    effectiveFrom: b.effectiveFrom,
    amount: centsToDollarText(b.monthlyAmountCents),
  }));
}

/** A new household row for `categoryId` from `month`, with no amount yet. */
export function newDraftRow(categoryId: number, month: string): DraftRow {
  return { key: newKey(), categoryId, ownerId: null, effectiveFrom: month, amount: '' };
}

/** Categories a budget can be set on: not transfers (they count in no total), not archived. */
export function budgetableCategories(categories: readonly Category[]): Category[] {
  return categories.filter((c) => c.kind !== 'transfer' && !c.archived);
}

export type DraftResult =
  { ok: true; budgets: BudgetRow[] } | { ok: false; key: string; message: string };

/**
 * The PUT body for `rows`, or the first problem: an amount that is empty, not a dollar amount
 * or negative; a month that is not YYYY-MM; or two rows for the same category, owner and month.
 */
export function draftToBudgets(rows: readonly DraftRow[]): DraftResult {
  const budgets: BudgetRow[] = [];
  for (const row of rows) {
    const cents = parseDollars(row.amount);
    if (cents === undefined || cents === null || cents < 0) {
      return { ok: false, key: row.key, message: 'Enter an amount of $0 or more.' };
    }
    if (!MONTH.test(row.effectiveFrom)) {
      return { ok: false, key: row.key, message: 'Choose the month the budget starts.' };
    }
    budgets.push({
      categoryId: row.categoryId,
      ownerId: row.ownerId,
      monthlyAmountCents: cents,
      effectiveFrom: row.effectiveFrom,
    });
  }
  const duplicate = duplicateBudget(budgets);
  if (duplicate !== null) {
    const row = rows[duplicate[1]];
    if (row !== undefined) {
      return {
        ok: false,
        key: row.key,
        message: 'Another budget has the same category, owner and start month.',
      };
    }
  }
  return { ok: true, budgets };
}

/**
 * Keys of the rows that apply in `month`: for each category and owner, the row with the latest
 * start month at or before it. Rows with a bad month are ignored.
 */
export function rowsInEffect(rows: readonly DraftRow[], month: string): Set<string> {
  const latest = new Map<string, DraftRow>();
  for (const row of rows) {
    if (!MONTH.test(row.effectiveFrom) || row.effectiveFrom > month) continue;
    const id = `${String(row.categoryId)}|${String(row.ownerId)}`;
    const current = latest.get(id);
    if (current === undefined || row.effectiveFrom > current.effectiveFrom) latest.set(id, row);
  }
  return new Set([...latest.values()].map((row) => row.key));
}

/** Rows ordered for display: by category order, household first, then owner, then month. */
export function sortDraft(
  rows: readonly DraftRow[],
  categories: readonly Category[],
  ownerOrder: readonly number[],
): DraftRow[] {
  const rank = (id: number) => {
    const index = categories.findIndex((c) => c.id === id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const ownerRank = (id: number | null) => (id === null ? -1 : ownerOrder.indexOf(id));
  return [...rows].sort(
    (a, b) =>
      rank(a.categoryId) - rank(b.categoryId) ||
      ownerRank(a.ownerId) - ownerRank(b.ownerId) ||
      a.effectiveFrom.localeCompare(b.effectiveFrom),
  );
}
