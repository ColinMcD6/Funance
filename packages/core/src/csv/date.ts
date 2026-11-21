import { isIsoDate, type CsvMapping } from '@funance/shared';

/**
 * Reads a date cell in the mapping's `dateFormat` and returns it as `YYYY-MM-DD`, or null when
 * it is not a real calendar date in that format. Text only: no `Date` object is involved.
 * Day and month may be written with one or two digits in every slash format, because a file
 * re-saved by a spreadsheet often drops the leading zeros; the year needs four digits.
 */
export function parseCsvDate(text: string, format: CsvMapping['dateFormat']): string | null {
  const s = text.trim();
  let year: string | undefined;
  let month: string | undefined;
  let day: string | undefined;

  if (format === 'yyyy-MM-dd') {
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
    [, year, month, day] = m ?? [];
  } else {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
    if (format === 'dd/MM/yyyy') [, day, month, year] = m ?? [];
    else [, month, day, year] = m ?? [];
  }
  if (year === undefined || month === undefined || day === undefined) return null;

  const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  return isIsoDate(iso) ? iso : null;
}
