/** How often one category was used for a merchant key or a bank category, and when last. */
export type CategoryTally = {
  categoryId: number;
  count: number;
  /** The newest transaction date ('YYYY-MM-DD') among those uses. */
  lastDate: string;
};

/**
 * The most frequent category in `tallies`, or null when there are none. Ties go to the category
 * used most recently, then to the lower id, so the answer never depends on row order.
 */
export function mostFrequentCategory(tallies: readonly CategoryTally[]): number | null {
  let best: CategoryTally | null = null;
  for (const tally of tallies) {
    if (
      best === null ||
      tally.count > best.count ||
      (tally.count === best.count && tally.lastDate > best.lastDate) ||
      (tally.count === best.count &&
        tally.lastDate === best.lastDate &&
        tally.categoryId < best.categoryId)
    ) {
      best = tally;
    }
  }
  return best?.categoryId ?? null;
}

/**
 * PLAN.md section 3, "Categorize": the most frequent category among categorized transactions with
 * the same merchant key, falling back to the category most often paired with the row's bank
 * category; null when neither has any history.
 */
export function suggestCategory(
  merchantTallies: readonly CategoryTally[],
  bankCategoryTallies: readonly CategoryTally[],
): number | null {
  return mostFrequentCategory(merchantTallies) ?? mostFrequentCategory(bankCategoryTallies);
}
