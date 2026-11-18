import { describe, expect, it } from 'vitest';
import { formatCents } from './money.js';

describe('formatCents', () => {
  it.each([
    [0, '$0.00'],
    [1, '$0.01'],
    [120000, '$1,200.00'],
    [-120000, '-$1,200.00'],
    [-4510, '-$45.10'],
    [123456789, '$1,234,567.89'],
  ])('formats %i as %s', (cents, expected) => {
    expect(formatCents(cents)).toBe(expected);
  });

  it('rejects non-integer input', () => {
    expect(() => formatCents(1.5)).toThrow(RangeError);
    expect(() => formatCents(Number.NaN)).toThrow(RangeError);
  });
});
