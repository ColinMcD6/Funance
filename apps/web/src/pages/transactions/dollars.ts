// Amount filter inputs are typed in dollars and sent as integer cents, without floating point.

const DOLLARS = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

/**
 * Cents for a dollar amount typed by a person: `12`, `-12.5`, `$1,200.00`. Undefined for an
 * empty field, null when the text is not an amount.
 */
export function parseDollars(text: string): number | null | undefined {
  const cleaned = text.replace(/[$,\s]/g, '');
  if (cleaned === '') return undefined;
  const match = DOLLARS.exec(cleaned);
  if (match === null) return null;
  const [, minus, whole = '0', fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return minus === undefined || cents === 0 ? cents : -cents;
}

/** The text an amount filter field shows for `cents`: `-12.50`, `3.00`; empty when unset. */
export function centsToDollarText(cents: number | undefined): string {
  if (cents === undefined) return '';
  const abs = Math.abs(cents);
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `-${text}` : text;
}
