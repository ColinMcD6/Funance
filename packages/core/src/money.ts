/**
 * Formats integer cents for display as `$1,234.56` or `-$1,234.56`.
 * Works on integers only, so no floating-point rounding is involved.
 */
export function formatCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError(`Expected an integer number of cents, got ${cents}`);
  }
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.trunc(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rest = (abs % 100).toString().padStart(2, '0');
  return `${sign}$${dollars}.${rest}`;
}
