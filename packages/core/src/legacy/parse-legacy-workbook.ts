import type { CategoryKind, LegacyMonthTotal, LegacyViolation } from '@funance/shared';
import ExcelJS from 'exceljs';
import { dedupKey } from '../csv/dedup.js';
import { merchantKey } from '../csv/merchant.js';
import type { ParsedErrorRow, ParsedOkRow } from '../csv/parse-csv.js';

// PLAN.md section 2, "Legacy spreadsheet format (specification)", and milestone ML. Reads the old
// tracking workbook and checks every rule of the specification, reporting each broken rule as
// one violation that names its sheet, row, column and rule.

/** A category the workbook may name, matched by exact name. */
export type LegacyCategory = { id: number; name: string; kind: CategoryKind };

/** An owner the workbook may name, matched by exact name. */
export type LegacyOwner = { id: number; name: string };

/** Identifiers of the specification's rules, as reported in `LegacyViolation.rule`. */
export const LEGACY_RULES = {
  fileFormat: 'file-format',
  noMonthSheets: 'no-month-sheets',
  sheetName: 'sheet-name',
  hiddenSheet: 'hidden-sheet',
  header: 'header',
  blankRow: 'blank-row',
  mergedCells: 'merged-cells',
  formula: 'formula',
  required: 'required',
  dateType: 'date-type',
  dateMonth: 'date-month',
  dateTime: 'date-time',
  descriptionType: 'description-type',
  descriptionLength: 'description-length',
  descriptionLineBreak: 'description-line-break',
  descriptionSpaces: 'description-spaces',
  amountType: 'amount-type',
  amountZero: 'amount-zero',
  amountDecimals: 'amount-decimals',
  categoryName: 'category-name',
  ownerName: 'owner-name',
  incomeSign: 'income-sign',
} as const;
export type LegacyRule = (typeof LEGACY_RULES)[keyof typeof LEGACY_RULES];

/** A valid transaction row. `line` is the sheet row; `amountCents` is already sign-flipped. */
export type LegacyOkRow = ParsedOkRow & {
  sheet: string;
  categoryId: number;
  /** 1-based index among the workbook's rows with the same dedup key. */
  occurrence: number;
};

/** A transaction row that breaks at least one rule; `reason` joins the messages. */
export type LegacyErrorRow = ParsedErrorRow & { sheet: string };

export type LegacyRow = LegacyOkRow | LegacyErrorRow;

export type LegacyWorkbook = {
  /** One row per transaction row of every month sheet, in sheet then row order. */
  rows: LegacyRow[];
  /** Every broken rule. Commit is allowed only when this is empty. */
  violations: LegacyViolation[];
  /** One entry per month sheet, oldest first. */
  monthTotals: LegacyMonthTotal[];
};

export const LEGACY_HEADERS = ['Date', 'Description', 'Amount', 'Category', 'Owner'] as const;
const COLUMNS = ['A', 'B', 'C', 'D', 'E'] as const;
type Column = (typeof COLUMNS)[number];

const CATEGORIES_SHEET = 'Categories';
const MONTH_SHEET = /^(0[1-9]|1[0-2])-(\d{4})$/;
const MAX_DESCRIPTION = 200;

const { ValueType } = ExcelJS;

/** A cell value as JSON, for the row's `raw` copy. */
function cellJson(cell: ExcelJS.Cell): unknown {
  const { value } = cell;
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;
  if ('formula' in value || 'sharedFormula' in value) return `=${cell.formula}`;
  if ('richText' in value) return value.richText.map((t) => t.text).join('');
  if ('text' in value && typeof value.text === 'string') return value.text;
  if ('error' in value) return value.error;
  return null;
}

/** A cell value as text for a message: empty for an empty cell. */
function cellDisplay(cell: ExcelJS.Cell): string {
  const value = cellJson(cell);
  if (value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** The text of a plain or rich-text string cell; null for any other type. */
function cellText(cell: ExcelJS.Cell): string | null {
  if (cell.type === ValueType.String && typeof cell.value === 'string') return cell.value;
  if (cell.type === ValueType.RichText) {
    const value = cell.value as ExcelJS.CellRichTextValue;
    return value.richText.map((t) => t.text).join('');
  }
  return null;
}

function isEmpty(cell: ExcelJS.Cell): boolean {
  const { value } = cell;
  return value === null || value === undefined || (typeof value === 'string' && value === '');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/**
 * An Excel number as integer cents without floating-point maths: the shortest decimal text of
 * the number must have at most two decimals. 54.46 → 5446, 54.463 → null.
 */
function numberToCents(value: number): number | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(value));
  if (match === null) return null;
  const [, sign = '', whole = '0', fraction = ''] = match;
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents)) return null;
  return sign === '-' ? -cents : cents;
}

type RowCheck = {
  violations: LegacyViolation[];
  add: (column: Column | null, rule: LegacyRule, message: string) => void;
};

function rowCheck(sheet: string, row: number | null): RowCheck {
  const violations: LegacyViolation[] = [];
  return {
    violations,
    add: (column, rule, message) => {
      violations.push({ sheet, row, column, rule, message });
    },
  };
}

type ReadRow = {
  ok: Omit<LegacyOkRow, 'occurrence'> | null;
  raw: Record<string, unknown>;
  violations: LegacyViolation[];
  /** The sheet's amount in cents (spending positive), when the Amount cell could be read. */
  sheetCents: number | null;
};

/** Checks one non-blank transaction row against the column rules. */
function readRow(
  sheet: string,
  month: string,
  row: ExcelJS.Row,
  categories: ReadonlyMap<string, LegacyCategory>,
  owners: ReadonlyMap<string, LegacyOwner>,
): ReadRow {
  const check = rowCheck(sheet, row.number);
  const cells = COLUMNS.map((column) => row.getCell(column));
  const [dateCell, descriptionCell, amountCell, categoryCell, ownerCell] = cells as [
    ExcelJS.Cell,
    ExcelJS.Cell,
    ExcelJS.Cell,
    ExcelJS.Cell,
    ExcelJS.Cell,
  ];
  const raw: Record<string, unknown> = { sheet };
  LEGACY_HEADERS.forEach((header, i) => {
    const cell = cells[i];
    raw[header] = cell === undefined ? null : cellJson(cell);
  });

  if (cells.some((cell) => cell.isMerged)) {
    check.add(null, LEGACY_RULES.mergedCells, 'Columns A to E must not contain merged cells');
    return { ok: null, raw, violations: check.violations, sheetCents: null };
  }

  // A formula cell breaks one rule; its other checks are skipped so each problem is reported once.
  const usable = (cell: ExcelJS.Cell, column: Column, header: string): boolean => {
    if (cell.type === ValueType.Formula) {
      check.add(column, LEGACY_RULES.formula, `${header} must be a typed value, not a formula`);
      return false;
    }
    if (isEmpty(cell)) {
      check.add(column, LEGACY_RULES.required, `${header} is required`);
      return false;
    }
    return true;
  };

  let date: string | null = null;
  if (usable(dateCell, 'A', 'Date')) {
    const value = dateCell.value;
    if (dateCell.type !== ValueType.Date || !(value instanceof Date) || isNaN(value.getTime())) {
      check.add('A', LEGACY_RULES.dateType, 'Date must be an Excel date, not text or a number');
    } else {
      const iso = `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
      const hasTime =
        value.getUTCHours() !== 0 ||
        value.getUTCMinutes() !== 0 ||
        value.getUTCSeconds() !== 0 ||
        value.getUTCMilliseconds() !== 0;
      if (hasTime) {
        check.add('A', LEGACY_RULES.dateTime, `Date ${iso} has a time of day`);
      } else if (iso.slice(0, 7) !== month) {
        check.add('A', LEGACY_RULES.dateMonth, `Date ${iso} is not in the sheet's month`);
      } else {
        date = iso;
      }
    }
  }

  let description: string | null = null;
  if (usable(descriptionCell, 'B', 'Description')) {
    const text = cellText(descriptionCell);
    if (text === null) {
      check.add('B', LEGACY_RULES.descriptionType, 'Description must be text');
    } else if (/[\r\n]/.test(text)) {
      check.add('B', LEGACY_RULES.descriptionLineBreak, 'Description must not contain line breaks');
    } else if (text !== text.trim()) {
      check.add(
        'B',
        LEGACY_RULES.descriptionSpaces,
        'Description must not start or end with a space',
      );
    } else if (text.length > MAX_DESCRIPTION) {
      check.add(
        'B',
        LEGACY_RULES.descriptionLength,
        `Description is ${text.length} characters; the most allowed is ${MAX_DESCRIPTION}`,
      );
    } else {
      description = text.replace(/\s+/g, ' ');
    }
  }

  let sheetCents: number | null = null;
  if (usable(amountCell, 'C', 'Amount')) {
    const value = amountCell.value;
    if (amountCell.type !== ValueType.Number || typeof value !== 'number') {
      check.add('C', LEGACY_RULES.amountType, 'Amount must be a number, not text');
    } else if (value === 0) {
      check.add('C', LEGACY_RULES.amountZero, 'Amount must not be zero');
    } else {
      const cents = numberToCents(value);
      if (cents === null) {
        check.add(
          'C',
          LEGACY_RULES.amountDecimals,
          `Amount ${value} has more than 2 decimal places`,
        );
      } else {
        sheetCents = cents;
      }
    }
  }

  let category: LegacyCategory | null = null;
  if (usable(categoryCell, 'D', 'Category')) {
    const text = cellText(categoryCell);
    category = text === null ? null : (categories.get(text) ?? null);
    if (category === null) {
      check.add(
        'D',
        LEGACY_RULES.categoryName,
        `Category "${cellDisplay(categoryCell)}" is not one of the allowed names`,
      );
    }
  }

  let owner: LegacyOwner | null = null;
  if (usable(ownerCell, 'E', 'Owner')) {
    const text = cellText(ownerCell);
    owner = text === null ? null : (owners.get(text) ?? null);
    if (owner === null) {
      check.add(
        'E',
        LEGACY_RULES.ownerName,
        `Owner "${cellDisplay(ownerCell)}" is not one of ${[...owners.keys()].join(', ')}`,
      );
    }
  }

  if (category?.kind === 'income' && sheetCents !== null && sheetCents > 0) {
    check.add('C', LEGACY_RULES.incomeSign, `A ${category.name} row must have a negative amount`);
  }

  if (
    check.violations.length > 0 ||
    date === null ||
    description === null ||
    sheetCents === null ||
    category === null ||
    owner === null
  ) {
    return { ok: null, raw, violations: check.violations, sheetCents };
  }

  const amountCents = -sheetCents;
  return {
    ok: {
      line: row.number,
      raw,
      sheet,
      status: 'parsed',
      date,
      postedDate: null,
      amountCents,
      description,
      memo: null,
      merchantKey: merchantKey(description),
      bankCategory: null,
      externalId: null,
      dedupKey: dedupKey({ date, amountCents, description, externalId: null }),
      ownerHint: null,
      ownerId: owner.id,
      categoryId: category.id,
    },
    raw,
    violations: check.violations,
    sheetCents,
  };
}

function isBlankRow(row: ExcelJS.Row): boolean {
  return COLUMNS.every((column) => isEmpty(row.getCell(column)));
}

/**
 * Reads the legacy workbook (PLAN.md milestone ML). Never throws on bad input: an unreadable
 * file is a `file-format` violation. Each valid row becomes a `parsed` row with the sheet's
 * amount sign-flipped into cents; a row breaking any rule becomes an `error` row, and every
 * broken rule is also listed in `violations` with its sheet, row, column and rule.
 *
 * `categories` and `owners` are the names a row may use (matched exactly).
 */
export async function parseLegacyWorkbook(
  bytes: Uint8Array,
  categories: readonly LegacyCategory[],
  owners: readonly LegacyOwner[],
): Promise<LegacyWorkbook> {
  const workbook = new ExcelJS.Workbook();
  try {
    // exceljs accepts an ArrayBuffer; copying keeps the caller's bytes untouched.
    await workbook.xlsx.load(bytes.slice().buffer);
  } catch {
    return {
      rows: [],
      violations: [
        {
          sheet: '',
          row: null,
          column: null,
          rule: LEGACY_RULES.fileFormat,
          message: 'The file is not a readable .xlsx workbook (or it has a password)',
        },
      ],
      monthTotals: [],
    };
  }

  const categoryByName = new Map(categories.map((c) => [c.name, c]));
  const ownerByName = new Map(owners.map((o) => [o.name, o]));
  const rows: LegacyRow[] = [];
  const violations: LegacyViolation[] = [];
  const monthTotals: LegacyMonthTotal[] = [];

  for (const worksheet of workbook.worksheets) {
    const sheet = worksheet.name;
    const sheetCheck = rowCheck(sheet, null);
    if (worksheet.state !== 'visible') {
      sheetCheck.add(null, LEGACY_RULES.hiddenSheet, `Sheet "${sheet}" is hidden`);
    }
    violations.push(...sheetCheck.violations);
    if (sheet === CATEGORIES_SHEET) continue;

    const nameMatch = MONTH_SHEET.exec(sheet);
    if (nameMatch === null) {
      violations.push({
        sheet,
        row: null,
        column: null,
        rule: LEGACY_RULES.sheetName,
        message: `Sheet "${sheet}" is not named MM-YYYY (for example 09-2025) or Categories`,
      });
      continue;
    }
    const month = `${nameMatch[2] ?? ''}-${nameMatch[1] ?? ''}`;

    const headerRow = worksheet.getRow(1);
    COLUMNS.forEach((column, i) => {
      const expected = LEGACY_HEADERS[i] ?? '';
      const cell = headerRow.getCell(column);
      if (cellText(cell) !== expected) {
        violations.push({
          sheet,
          row: 1,
          column,
          rule: LEGACY_RULES.header,
          message: `Header ${column}1 must be "${expected}", not "${cellDisplay(cell)}"`,
        });
      }
    });

    let lastUsed = 1;
    for (let r = worksheet.rowCount; r >= 2; r--) {
      if (!isBlankRow(worksheet.getRow(r))) {
        lastUsed = r;
        break;
      }
    }

    let count = 0;
    let sheetTotalCents = 0;
    for (let r = 2; r <= lastUsed; r++) {
      const row = worksheet.getRow(r);
      if (isBlankRow(row)) {
        violations.push({
          sheet,
          row: r,
          column: null,
          rule: LEGACY_RULES.blankRow,
          message: 'Blank row between transactions',
        });
        continue;
      }
      count += 1;
      const read = readRow(sheet, month, row, categoryByName, ownerByName);
      if (read.sheetCents !== null) sheetTotalCents += read.sheetCents;
      violations.push(...read.violations);
      if (read.ok !== null) {
        rows.push({ ...read.ok, occurrence: 0 });
      } else {
        rows.push({
          line: r,
          raw: read.raw,
          sheet,
          status: 'error',
          reason: read.violations.map((v) => v.message).join('; '),
        });
      }
    }
    monthTotals.push({ month, count, sheetTotalCents });
  }

  if (monthTotals.length === 0 && !violations.some((v) => v.rule === LEGACY_RULES.fileFormat)) {
    violations.push({
      sheet: '',
      row: null,
      column: null,
      rule: LEGACY_RULES.noMonthSheets,
      message: 'The workbook has no month sheet named MM-YYYY',
    });
  }

  // Identical rows are separate transactions: number them 1, 2, ... per dedup key.
  const seen = new Map<string, number>();
  for (const row of rows) {
    if (row.status !== 'parsed') continue;
    const occurrence = (seen.get(row.dedupKey) ?? 0) + 1;
    seen.set(row.dedupKey, occurrence);
    row.occurrence = occurrence;
  }

  monthTotals.sort((a, b) => a.month.localeCompare(b.month));
  return { rows, violations, monthTotals };
}
