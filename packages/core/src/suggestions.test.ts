import { describe, expect, it } from 'vitest';
import { mostFrequentCategory, suggestCategory, type CategoryTally } from './suggestions.js';

const tally = (categoryId: number, count: number, lastDate = '2026-10-01'): CategoryTally => ({
  categoryId,
  count,
  lastDate,
});

describe('mostFrequentCategory', () => {
  it('is null with no history', () => {
    expect(mostFrequentCategory([])).toBeNull();
  });

  it('picks the most frequent category whatever the order', () => {
    expect(mostFrequentCategory([tally(1, 2), tally(2, 5), tally(3, 1)])).toBe(2);
    expect(mostFrequentCategory([tally(3, 1), tally(2, 5), tally(1, 2)])).toBe(2);
  });

  it('breaks a count tie by the most recent use, then by the lower id', () => {
    expect(mostFrequentCategory([tally(1, 3, '2026-09-01'), tally(2, 3, '2026-10-01')])).toBe(2);
    expect(mostFrequentCategory([tally(2, 3, '2026-10-01'), tally(1, 3, '2026-09-01')])).toBe(2);
    expect(mostFrequentCategory([tally(7, 3), tally(4, 3)])).toBe(4);
    expect(mostFrequentCategory([tally(4, 3), tally(7, 3)])).toBe(4);
  });
});

describe('suggestCategory', () => {
  it('prefers the merchant history over the bank category', () => {
    expect(suggestCategory([tally(1, 1)], [tally(2, 9)])).toBe(1);
  });

  it('falls back to the bank category pairing when the merchant has no history', () => {
    expect(suggestCategory([], [tally(2, 9), tally(3, 1)])).toBe(2);
  });

  it('is null when neither has history', () => {
    expect(suggestCategory([], [])).toBeNull();
  });
});
