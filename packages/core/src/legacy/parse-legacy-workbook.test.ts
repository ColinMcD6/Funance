import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { dedupKey } from '../csv/dedup.js';
import {
  LEGACY_RULES,
  parseLegacyWorkbook,
  type LegacyCategory,
  type LegacyOwner,
} from './parse-legacy-workbook.js';

const CATEGORIES: LegacyCategory[] = [
  { id: 1, name: 'Groceries', kind: 'expense' },
  { id: 2, name: 'Income', kind: 'income' },
  { id: 3, name: 'Investing', kind: 'savings' },
  { id: 4, name: 'Car Maintenance', kind: 'expense' },
];
const OWNERS: LegacyOwner[] = [
  { id: 1, name: 'Colin' },
  { id: 2, name: 'Emily' },
  { id: 3, name: 'Joint' },
];

const HEADERS = ['Date', 'Description', 'Amount', 'Category', 'Owner'];
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const GOOD: ExcelJS.CellValue[] = [utc(2025, 9, 5), 'Superstore', 45.5, 'Groceries', 'Joint'];

type SheetSpec = {
  name?: string;
  headers?: ExcelJS.CellValue[];
  rows?: (ExcelJS.CellValue[] | null)[];
  state?: ExcelJS.WorksheetState;
  setup?: (sheet: ExcelJS.Worksheet) => void;
};

async function workbook(...sheets: SheetSpec[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  for (const spec of sheets) {
    const sheet = wb.addWorksheet(spec.name ?? '09-2025', { state: spec.state ?? 'visible' });
    sheet.getRow(1).values = spec.headers ?? HEADERS;
    (spec.rows ?? [GOOD]).forEach((row, i) => {
      if (row === null) return;
      row.forEach((value, c) => {
        sheet.getRow(i + 2).getCell(c + 1).value = value;
      });
    });
    spec.setup?.(sheet);
  }
  return new Uint8Array(await wb.xlsx.writeBuffer());
}

/** One row with `column` (0-based) replaced, in a 09-2025 sheet. */
function rowWith(column: number, value: ExcelJS.CellValue): ExcelJS.CellValue[] {
  const row = [...GOOD];
  row[column] = value;
  return row;
}

async function parse(bytes: Uint8Array) {
  return parseLegacyWorkbook(bytes, CATEGORIES, OWNERS);
}

async function violationsOf(...sheets: SheetSpec[]) {
  const result = await parse(await workbook(...sheets));
  return result.violations.map(({ sheet, row, column, rule }) => ({ sheet, row, column, rule }));
}

describe('parseLegacyWorkbook: valid rows', () => {
  it('reads a row with the amount sign-flipped into cents and the names looked up', async () => {
    const result = await parse(await workbook({}));
    expect(result.violations).toEqual([]);
    expect(result.rows).toEqual([
      {
        line: 2,
        sheet: '09-2025',
        status: 'parsed',
        date: '2025-09-05',
        postedDate: null,
        amountCents: -4550,
        description: 'Superstore',
        memo: null,
        merchantKey: 'SUPERSTORE',
        bankCategory: null,
        externalId: null,
        dedupKey: dedupKey({
          date: '2025-09-05',
          amountCents: -4550,
          description: 'Superstore',
          externalId: null,
        }),
        ownerHint: null,
        ownerId: 3,
        categoryId: 1,
        occurrence: 1,
        raw: {
          sheet: '09-2025',
          Date: '2025-09-05T00:00:00.000Z',
          Description: 'Superstore',
          Amount: 45.5,
          Category: 'Groceries',
          Owner: 'Joint',
        },
      },
    ]);
    expect(result.monthTotals).toEqual([{ month: '2025-09', count: 1, sheetTotalCents: 4550 }]);
  });

  it('reads negative amounts (refunds, income) as money arriving', async () => {
    const result = await parse(
      await workbook({
        rows: [rowWith(2, -2100), [utc(2025, 9, 6), 'Pay', -1500.25, 'Income', 'Colin']],
      }),
    );
    expect(result.violations).toEqual([]);
    expect(result.rows.map((r) => (r.status === 'parsed' ? r.amountCents : null))).toEqual([
      210000, 150025,
    ]);
    expect(result.monthTotals[0]?.sheetTotalCents).toBe(-360025);
  });

  it('keeps identical rows as separate transactions with increasing occurrence', async () => {
    const result = await parse(await workbook({ rows: [GOOD, GOOD, rowWith(1, 'Other')] }));
    expect(result.rows.map((r) => (r.status === 'parsed' ? r.occurrence : 0))).toEqual([1, 2, 1]);
  });

  it('ignores a Categories sheet, columns from F onward and empty trailing rows', async () => {
    const result = await parse(
      await workbook(
        { name: 'Categories', headers: ['Category', 'Major Category'], rows: [['Gas', 'Car']] },
        {
          rows: [[...GOOD, 'Groceries', 'note']],
          setup: (sheet) => {
            sheet.getCell('F1').value = 'Major Category';
            for (let r = 2; r <= 8; r++) {
              sheet.getCell(`F${r}`).value = { formula: `D${r}`, result: '' };
            }
          },
        },
      ),
    );
    expect(result.violations).toEqual([]);
    expect(result.rows).toHaveLength(1);
  });

  it('accepts rich-text cells as text and collapses inner whitespace', async () => {
    const result = await parse(
      await workbook({
        rows: [rowWith(1, { richText: [{ text: 'Super' }, { text: 'store  West' }] })],
      }),
    );
    expect(result.violations).toEqual([]);
    expect(result.rows[0]).toMatchObject({ description: 'Superstore West' });
  });

  it('sorts month totals and gives an empty month sheet a zero total', async () => {
    const result = await parse(
      await workbook(
        { name: '10-2025', rows: [rowWith(0, utc(2025, 10, 1))] },
        { name: '09-2025', rows: [] },
      ),
    );
    expect(result.violations).toEqual([]);
    expect(result.monthTotals).toEqual([
      { month: '2025-09', count: 0, sheetTotalCents: 0 },
      { month: '2025-10', count: 1, sheetTotalCents: 4550 },
    ]);
  });
});

describe('parseLegacyWorkbook: one test per rule of the specification', () => {
  it(LEGACY_RULES.fileFormat, async () => {
    const result = await parse(new TextEncoder().encode('Date,Description\n2025-09-01,x\n'));
    expect(result.rows).toEqual([]);
    expect(result.violations).toEqual([
      expect.objectContaining({ sheet: '', row: null, column: null, rule: 'file-format' }),
    ]);
  });

  it(LEGACY_RULES.noMonthSheets, async () => {
    expect(await violationsOf({ name: 'Categories' })).toEqual([
      { sheet: '', row: null, column: null, rule: 'no-month-sheets' },
    ]);
  });

  it(LEGACY_RULES.sheetName, async () => {
    for (const name of ['Sheet1', '9-2025', '13-2025', '2025-09', '09-25']) {
      expect(await violationsOf({}, { name })).toEqual([
        { sheet: name, row: null, column: null, rule: 'sheet-name' },
      ]);
    }
  });

  it(LEGACY_RULES.hiddenSheet, async () => {
    expect(await violationsOf({ state: 'hidden' })).toEqual([
      { sheet: '09-2025', row: null, column: null, rule: 'hidden-sheet' },
    ]);
    expect(await violationsOf({}, { name: 'Categories', state: 'veryHidden' })).toEqual([
      { sheet: 'Categories', row: null, column: null, rule: 'hidden-sheet' },
    ]);
  });

  it(LEGACY_RULES.header, async () => {
    expect(
      await violationsOf({ headers: ['Date', 'Description', 'Amount', 'Catergory', 'Type'] }),
    ).toEqual([
      { sheet: '09-2025', row: 1, column: 'D', rule: 'header' },
      { sheet: '09-2025', row: 1, column: 'E', rule: 'header' },
    ]);
    expect(await violationsOf({ headers: ['Date ', 'Description', 'Amount', 'Category'] })).toEqual(
      [
        { sheet: '09-2025', row: 1, column: 'A', rule: 'header' },
        { sheet: '09-2025', row: 1, column: 'E', rule: 'header' },
      ],
    );
  });

  it(LEGACY_RULES.blankRow, async () => {
    expect(await violationsOf({ rows: [GOOD, null, null, GOOD, null, null] })).toEqual([
      { sheet: '09-2025', row: 3, column: null, rule: 'blank-row' },
      { sheet: '09-2025', row: 4, column: null, rule: 'blank-row' },
    ]);
  });

  it(LEGACY_RULES.mergedCells, async () => {
    expect(
      await violationsOf({
        rows: [GOOD, GOOD],
        setup: (sheet) => {
          sheet.mergeCells('B3:C3');
        },
      }),
    ).toEqual([{ sheet: '09-2025', row: 3, column: null, rule: 'merged-cells' }]);
  });

  it(LEGACY_RULES.formula, async () => {
    expect(await violationsOf({ rows: [rowWith(2, { formula: '40+5.5', result: 45.5 })] })).toEqual(
      [{ sheet: '09-2025', row: 2, column: 'C', rule: 'formula' }],
    );
    expect(
      await violationsOf({ rows: [rowWith(3, { formula: '"Groceries"', result: 'Groceries' })] }),
    ).toEqual([{ sheet: '09-2025', row: 2, column: 'D', rule: 'formula' }]);
  });

  it(LEGACY_RULES.required, async () => {
    for (const [column, letter] of [
      [0, 'A'],
      [1, 'B'],
      [2, 'C'],
      [3, 'D'],
      [4, 'E'],
    ] as const) {
      expect(await violationsOf({ rows: [rowWith(column, null)] })).toEqual([
        { sheet: '09-2025', row: 2, column: letter, rule: 'required' },
      ]);
    }
    expect(await violationsOf({ rows: [rowWith(1, '')] })).toEqual([
      { sheet: '09-2025', row: 2, column: 'B', rule: 'required' },
    ]);
  });

  it(LEGACY_RULES.dateType, async () => {
    for (const value of ['2025-09-05', 45905, true]) {
      expect(await violationsOf({ rows: [rowWith(0, value)] })).toEqual([
        { sheet: '09-2025', row: 2, column: 'A', rule: 'date-type' },
      ]);
    }
  });

  it(LEGACY_RULES.dateMonth, async () => {
    expect(await violationsOf({ rows: [rowWith(0, utc(2025, 10, 1))] })).toEqual([
      { sheet: '09-2025', row: 2, column: 'A', rule: 'date-month' },
    ]);
  });

  it(LEGACY_RULES.dateTime, async () => {
    expect(
      await violationsOf({ rows: [rowWith(0, new Date(Date.UTC(2025, 8, 5, 9, 15)))] }),
    ).toEqual([{ sheet: '09-2025', row: 2, column: 'A', rule: 'date-time' }]);
  });

  it(LEGACY_RULES.descriptionType, async () => {
    expect(await violationsOf({ rows: [rowWith(1, 1234)] })).toEqual([
      { sheet: '09-2025', row: 2, column: 'B', rule: 'description-type' },
    ]);
  });

  it(LEGACY_RULES.descriptionLength, async () => {
    expect(await violationsOf({ rows: [rowWith(1, 'x'.repeat(200))] })).toEqual([]);
    expect(await violationsOf({ rows: [rowWith(1, 'x'.repeat(201))] })).toEqual([
      { sheet: '09-2025', row: 2, column: 'B', rule: 'description-length' },
    ]);
  });

  it(LEGACY_RULES.descriptionLineBreak, async () => {
    expect(await violationsOf({ rows: [rowWith(1, 'Two\nlines')] })).toEqual([
      { sheet: '09-2025', row: 2, column: 'B', rule: 'description-line-break' },
    ]);
  });

  it(LEGACY_RULES.descriptionSpaces, async () => {
    for (const value of [' Superstore', 'Superstore ']) {
      expect(await violationsOf({ rows: [rowWith(1, value)] })).toEqual([
        { sheet: '09-2025', row: 2, column: 'B', rule: 'description-spaces' },
      ]);
    }
  });

  it(LEGACY_RULES.amountType, async () => {
    for (const value of ['45.50', '$45.50', true]) {
      expect(await violationsOf({ rows: [rowWith(2, value)] })).toEqual([
        { sheet: '09-2025', row: 2, column: 'C', rule: 'amount-type' },
      ]);
    }
  });

  it(LEGACY_RULES.amountZero, async () => {
    expect(await violationsOf({ rows: [rowWith(2, 0)] })).toEqual([
      { sheet: '09-2025', row: 2, column: 'C', rule: 'amount-zero' },
    ]);
  });

  it(LEGACY_RULES.amountDecimals, async () => {
    for (const value of [54.463, 0.001, 1e-7]) {
      expect(await violationsOf({ rows: [rowWith(2, value)] })).toEqual([
        { sheet: '09-2025', row: 2, column: 'C', rule: 'amount-decimals' },
      ]);
    }
  });

  it(LEGACY_RULES.categoryName, async () => {
    for (const value of ['Car maintenance', 'Groceries ', 'Unknown', 7]) {
      expect(await violationsOf({ rows: [rowWith(3, value)] })).toEqual([
        { sheet: '09-2025', row: 2, column: 'D', rule: 'category-name' },
      ]);
    }
  });

  it(LEGACY_RULES.ownerName, async () => {
    for (const value of ['Joint ', 'joint', 'Alex']) {
      expect(await violationsOf({ rows: [rowWith(4, value)] })).toEqual([
        { sheet: '09-2025', row: 2, column: 'E', rule: 'owner-name' },
      ]);
    }
  });

  it(LEGACY_RULES.incomeSign, async () => {
    expect(
      await violationsOf({ rows: [[utc(2025, 9, 6), 'Pay', 1500, 'Income', 'Colin']] }),
    ).toEqual([{ sheet: '09-2025', row: 2, column: 'C', rule: 'income-sign' }]);
  });
});

describe('parseLegacyWorkbook: error rows', () => {
  it('turns a row breaking rules into one error row with every message, and still totals it', async () => {
    const result = await parse(
      await workbook({ rows: [GOOD, [utc(2025, 10, 1), ' x', 12, 'Nope', 'Joint']] }),
    );
    expect(result.violations.map((v) => v.rule)).toEqual([
      'date-month',
      'description-spaces',
      'category-name',
    ]);
    expect(result.rows[1]).toMatchObject({ status: 'error', line: 3, sheet: '09-2025' });
    const error = result.rows[1];
    expect(error?.status === 'error' ? error.reason.split('; ') : []).toHaveLength(3);
    expect(result.monthTotals).toEqual([{ month: '2025-09', count: 2, sheetTotalCents: 5750 }]);
  });

  it('does not read the rows of a sheet with a bad name', async () => {
    const result = await parse(await workbook({}, { name: 'Notes', rows: [GOOD, GOOD] }));
    expect(result.rows).toHaveLength(1);
  });

  it('leaves the caller’s bytes untouched', async () => {
    const bytes = await workbook({});
    const copy = bytes.slice();
    await parse(bytes);
    expect(bytes).toEqual(copy);
  });
});
