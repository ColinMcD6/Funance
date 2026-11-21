/** The result of reading one amount cell. */
export type AmountParse =
  { kind: 'empty' } | { kind: 'ok'; cents: number } | { kind: 'invalid'; reason: string };

/**
 * Reads a money amount as written by a bank into integer cents, without floating-point maths.
 * Strips `$`, thousands commas and spaces; a leading `-` or `+` (before or after the `$`) and
 * surrounding parentheses set the sign. At most two decimal places are accepted.
 *
 * `$1,200.00` → 120000, `-$1,200.00` → -120000, `(45.10)` → -4510, `` → empty.
 */
export function parseAmountCents(text: string): AmountParse {
  let s = text.replace(/[\s$]/g, '');
  if (s === '') return { kind: 'empty' };

  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-') || s.startsWith('+')) {
    if (s.startsWith('-')) negative = !negative;
    s = s.slice(1);
  }

  // Commas are thousands separators only, in groups of three. Anything else (a decimal comma such
  // as "12,34" in a French export) is rejected rather than read as a much larger amount.
  const match = /^(\d{1,3}(?:,\d{3})+|\d*)(?:\.(\d{0,2}))?$/.exec(s);
  const whole = (match?.[1] ?? '').replace(/,/g, '');
  const fraction = match?.[2] ?? '';
  if (match === null || (whole === '' && fraction === '')) {
    return {
      kind: 'invalid',
      reason: `Amount "${text.trim()}" is not a number with at most 2 decimals`,
    };
  }

  const cents = Number(whole === '' ? '0' : whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) {
    return { kind: 'invalid', reason: `Amount "${text.trim()}" is too large` };
  }
  return { kind: 'ok', cents: negative && cents !== 0 ? -cents : cents };
}
