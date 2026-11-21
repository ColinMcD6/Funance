/** One item's new position value. */
export type OrderPatch = { id: number; order: number };

/**
 * Moves `items[index]` one place up (`delta = -1`) or down (`+1`) in a list sorted by `order`, by
 * swapping its order value with its neighbour's. When both values are equal (so the list was
 * tied), the moved item alone steps one past its neighbour. Returns the patches to send, or none
 * when the move would leave the list.
 */
export function moveOrder(
  items: readonly { id: number; order: number }[],
  index: number,
  delta: -1 | 1,
): OrderPatch[] {
  const moved = items[index];
  const neighbour = items[index + delta];
  if (moved === undefined || neighbour === undefined) return [];
  if (moved.order === neighbour.order) return [{ id: moved.id, order: neighbour.order + delta }];
  return [
    { id: moved.id, order: neighbour.order },
    { id: neighbour.id, order: moved.order },
  ];
}
