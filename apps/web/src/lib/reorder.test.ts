import { describe, expect, it } from 'vitest';
import { moveOrder } from './reorder';

const items = [
  { id: 1, order: 10 },
  { id: 2, order: 20 },
  { id: 3, order: 30 },
];

describe('moveOrder', () => {
  it('swaps order values with the neighbour above or below', () => {
    expect(moveOrder(items, 1, -1)).toEqual([
      { id: 2, order: 10 },
      { id: 1, order: 20 },
    ]);
    expect(moveOrder(items, 1, 1)).toEqual([
      { id: 2, order: 30 },
      { id: 3, order: 20 },
    ]);
  });

  it('does nothing at either end', () => {
    expect(moveOrder(items, 0, -1)).toEqual([]);
    expect(moveOrder(items, 2, 1)).toEqual([]);
  });

  it('steps past a neighbour with the same value', () => {
    const tied = [
      { id: 1, order: 5 },
      { id: 2, order: 5 },
    ];
    expect(moveOrder(tied, 1, -1)).toEqual([{ id: 2, order: 4 }]);
    expect(moveOrder(tied, 0, 1)).toEqual([{ id: 1, order: 6 }]);
  });
});
