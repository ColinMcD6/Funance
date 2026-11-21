import type { LegacyViolation, PreviewRow } from '@funance/shared';

/** Where a violation is: "Sheet 07-2026, row 3, column A", or "Workbook". */
export function violationPlace(v: LegacyViolation): string {
  if (v.sheet === '') return 'Workbook';
  return [
    `Sheet ${v.sheet}`,
    v.row === null ? null : `row ${v.row}`,
    v.column === null ? null : `column ${v.column}`,
  ]
    .filter((part) => part !== null)
    .join(', ');
}

/** Where a legacy preview row is in the workbook: "07-2026 row 5". */
export function legacyRowLabel(row: PreviewRow): string {
  const raw = row.raw;
  const sheet = !Array.isArray(raw) && typeof raw.sheet === 'string' ? raw.sheet : '';
  return `${sheet} row ${row.line}`.trim();
}

/** Category names by id, as the workbook wrote them (GET /categories arrives with M6). */
export function legacyCategoryNames(rows: readonly PreviewRow[]): Map<number, string> {
  const names = new Map<number, string>();
  for (const row of rows) {
    const raw = row.raw;
    if (row.categoryId !== null && !Array.isArray(raw) && typeof raw.Category === 'string') {
      names.set(row.categoryId, raw.Category);
    }
  }
  return names;
}
