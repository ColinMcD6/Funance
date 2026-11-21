// Generator for the synthetic legacy workbooks in fixtures/legacy (PLAN.md section 6 and
// milestone ML). Run `pnpm fixtures:generate` to rewrite them. Every description is invented.
//
// legacy-valid.xlsx follows the format specification in PLAN.md section 2: three month sheets
// of 20 rows, a Categories sheet, refunds and income as negative amounts, two identical rows, a
// Major Category formula column and empty trailing rows.
// legacy-invalid.xlsx is the same workbook with one planted violation of every rule that can be
// planted in a workbook; PLANTED_VIOLATIONS lists them.
//
// xlsx files hold timestamps in their zip entries, so their bytes change on every run; tests
// compare what the files contain, not their bytes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ExcelJS from 'exceljs';

export const LEGACY_FIXTURE_DIR = import.meta.dirname;

/** The 26 sheet categories and their major category (PLAN.md section 2, "categories"). */
export const SHEET_CATEGORIES: Readonly<Record<string, string>> = {
  Clothing: 'Clothing',
  Donation: 'Giving',
  Gifts: 'Giving',
  Groceries: 'Groceries',
  Home: 'Housing',
  Coffee: 'Joy',
  'Eating out': 'Joy',
  Entertainment: 'Joy',
  Hobbies: 'Joy',
  Alcohol: 'Joy',
  Baby: 'Kid',
  Investing: 'Money',
  'Debt Payments': 'Money',
  Income: 'Money',
  Cat: 'Pet',
  Gas: 'Transportation',
  'Car Insurance': 'Transportation',
  'Transportation (Other)': 'Transportation',
  'Car Maintenance': 'Transportation',
  Travel: 'Travel',
  Internet: 'Utilities',
  Phone: 'Utilities',
  Vacation: 'Vacation',
  Health: 'Wellbeing',
  'Personal Care': 'Wellbeing',
  Education: 'Education',
};

type Cell = ExcelJS.CellValue;

/** One sheet row, columns A to E. */
type SheetRow = [Cell, Cell, Cell, Cell, Cell];

type MonthSheet = {
  name: string;
  /** Data rows from row 2; `null` is a completely blank row. */
  rows: (SheetRow | null)[];
  headers?: [string, string, string, string, string];
  merges?: string[];
};

/** mulberry32: a small seeded PRNG returning floats in [0, 1). */
function createRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(0, items.length - 1)];
    if (item === undefined) throw new Error('pick from an empty list');
    return item;
  };
  return { int, pick };
}

const day = (year: number, month: number, d: number) => new Date(Date.UTC(year, month - 1, d));

/** Purchases the generator draws from: description, category, owner, cents range. */
const PURCHASES: readonly [string, string, string, number, number][] = [
  ['Superstore groceries', 'Groceries', 'Joint', 4000, 22000],
  ['Corner bakery', 'Coffee', 'Emily', 350, 1200],
  ['Pho noodle house', 'Eating out', 'Joint', 2500, 9000],
  ['Movie night tickets', 'Entertainment', 'Joint', 1800, 4500],
  ['Yarn and needles', 'Hobbies', 'Emily', 1500, 6000],
  ['Liquor mart', 'Alcohol', 'Colin', 1500, 7000],
  ['Diapers and wipes', 'Baby', 'Joint', 2500, 8000],
  ['Cat food and litter', 'Cat', 'Joint', 2000, 6500],
  ['Gas station fill-up', 'Gas', 'Colin', 4000, 9000],
  ['Bus pass', 'Transportation (Other)', 'Emily', 5000, 10500],
  ['Pharmacy', 'Health', 'Emily', 800, 4500],
  ['Haircut', 'Personal Care', 'Colin', 2500, 4500],
  ['Hardware store', 'Home', 'Joint', 1200, 15000],
  ['Thrift store clothes', 'Clothing', 'Emily', 1000, 6000],
];

/** Fixed monthly rows (day, description, category, owner, sheet cents), spending positive. */
function fixedRows(month: number): [number, string, string, string, number][] {
  const rows: [number, string, string, string, number][] = [
    [1, 'Monthly internet bill', 'Internet', 'Joint', 8500],
    [3, 'Phone plan', 'Phone', 'Colin', 4500],
    [15, 'TFSA contribution', 'Investing', 'Joint', 50000],
    [20, 'Car insurance premium', 'Car Insurance', 'Joint', 13200],
  ];
  if (month === 7) {
    rows.push([10, 'Paycheque Northwind Mfg', 'Income', 'Colin', -210000]);
    rows.push([12, 'Refund Trailhead Outfitters', 'Clothing', 'Emily', -8000]);
  }
  if (month === 8) {
    // Two identical rows: both are separate transactions.
    rows.push([9, 'Tim Hortons', 'Coffee', 'Colin', 425]);
    rows.push([9, 'Tim Hortons', 'Coffee', 'Colin', 425]);
  }
  if (month === 9) {
    // The same date, amount and description as a row of tangerine-chequing-2026-09.csv.
    rows.push([1, 'Interac - Purchase - SOBEYS 4567 WINNIPEG MB CA', 'Groceries', 'Joint', 6778]);
    rows.push([25, 'Charity run donation', 'Donation', 'Emily', 5000]);
  }
  return rows;
}

const ROWS_PER_SHEET = 20;
export const LEGACY_MONTHS = [7, 8, 9] as const;
const YEAR = 2026;

/** The valid workbook's month sheets, 20 rows each, sorted by date. */
function validSheets(): MonthSheet[] {
  const rng = createRng(20260701);
  return LEGACY_MONTHS.map((month) => {
    const rows = fixedRows(month);
    while (rows.length < ROWS_PER_SHEET) {
      const [description, category, owner, min, max] = rng.pick(PURCHASES);
      rows.push([rng.int(1, 28), description, category, owner, rng.int(min, max)]);
    }
    rows.sort((a, b) => a[0] - b[0]);
    return {
      name: `${String(month).padStart(2, '0')}-${YEAR}`,
      rows: rows.map(([d, description, category, owner, cents]): SheetRow => [
        day(YEAR, month, d),
        description,
        cents / 100,
        category,
        owner,
      ]),
    };
  });
}

const HEADERS: [string, string, string, string, string] = [
  'Date',
  'Description',
  'Amount',
  'Category',
  'Owner',
];

/** Trailing rows that keep the Major Category formula but are otherwise empty. */
const TRAILING_FORMULA_ROWS = 5;

function addCategoriesSheet(workbook: ExcelJS.Workbook, hidden: boolean): void {
  const sheet = workbook.addWorksheet('Categories', { state: hidden ? 'hidden' : 'visible' });
  sheet.addRow(['Category', 'Major Category']);
  for (const [category, group] of Object.entries(SHEET_CATEGORIES)) {
    sheet.addRow([category, group]);
  }
}

function addMonthSheet(workbook: ExcelJS.Workbook, month: MonthSheet): void {
  const sheet = workbook.addWorksheet(month.name);
  sheet.getRow(1).values = [...(month.headers ?? HEADERS), 'Major Category'];
  month.rows.forEach((row, i) => {
    if (row === null) return;
    const r = sheet.getRow(i + 2);
    row.forEach((value, c) => {
      r.getCell(c + 1).value = value;
    });
  });
  const lastRow = month.rows.length + 1 + TRAILING_FORMULA_ROWS;
  for (let r = 2; r <= lastRow; r++) {
    const category = sheet.getCell(`D${r}`).value;
    sheet.getCell(`F${r}`).value = {
      formula: `IFERROR(VLOOKUP(D${r},Categories!A:B,2,FALSE),"")`,
      result: typeof category === 'string' ? (SHEET_CATEGORIES[category] ?? '') : '',
    };
  }
  sheet.getColumn('A').numFmt = 'yyyy-mm-dd';
  sheet.getColumn('C').numFmt = '"$"#,##0.00';
  for (const range of month.merges ?? []) sheet.mergeCells(range);
}

async function toBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  workbook.creator = 'fixtures/legacy/generate.ts';
  workbook.created = day(2026, 11, 1);
  workbook.modified = day(2026, 11, 1);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

/** legacy-valid.xlsx */
export async function buildValidWorkbook(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  addCategoriesSheet(workbook, false);
  for (const month of validSheets()) addMonthSheet(workbook, month);
  return toBytes(workbook);
}

/** One violation planted in legacy-invalid.xlsx: where it is and the rule it breaks. */
export type PlantedViolation = {
  sheet: string;
  row: number | null;
  column: string | null;
  rule: string;
};

/** Every violation in legacy-invalid.xlsx, in the order the parser reports them. */
export const PLANTED_VIOLATIONS: readonly PlantedViolation[] = [
  { sheet: 'Categories', row: null, column: null, rule: 'hidden-sheet' },
  { sheet: '07-2026', row: 1, column: 'D', rule: 'header' },
  { sheet: '07-2026', row: 3, column: 'A', rule: 'date-type' },
  { sheet: '07-2026', row: 4, column: 'A', rule: 'date-month' },
  { sheet: '07-2026', row: 5, column: 'A', rule: 'date-time' },
  { sheet: '07-2026', row: 6, column: 'B', rule: 'description-line-break' },
  { sheet: '07-2026', row: 7, column: 'B', rule: 'description-spaces' },
  { sheet: '07-2026', row: 8, column: 'B', rule: 'description-length' },
  { sheet: '07-2026', row: 9, column: 'B', rule: 'description-type' },
  { sheet: '07-2026', row: 10, column: 'B', rule: 'required' },
  { sheet: '08-2026', row: 3, column: 'C', rule: 'amount-type' },
  { sheet: '08-2026', row: 4, column: 'C', rule: 'amount-zero' },
  { sheet: '08-2026', row: 5, column: 'C', rule: 'amount-decimals' },
  { sheet: '08-2026', row: 6, column: 'C', rule: 'formula' },
  { sheet: '08-2026', row: 7, column: 'D', rule: 'category-name' },
  { sheet: '08-2026', row: 8, column: 'E', rule: 'owner-name' },
  { sheet: '08-2026', row: 9, column: 'C', rule: 'income-sign' },
  { sheet: '08-2026', row: 10, column: null, rule: 'merged-cells' },
  { sheet: '09-2026', row: 12, column: null, rule: 'blank-row' },
  { sheet: 'Notes', row: null, column: null, rule: 'sheet-name' },
];

function setCell(sheet: MonthSheet, row: number, column: number, value: Cell): void {
  const target = sheet.rows[row - 2];
  if (target == null) throw new Error(`No row ${row} in ${sheet.name}`);
  target[column] = value;
}

/** legacy-invalid.xlsx: the valid workbook with PLANTED_VIOLATIONS. */
export async function buildInvalidWorkbook(): Promise<Uint8Array> {
  const [july, august, september] = validSheets();
  if (july === undefined || august === undefined || september === undefined) {
    throw new Error('Expected three month sheets');
  }
  const [A, B, C, D, E] = [0, 1, 2, 3, 4] as const;

  july.headers = ['Date', 'Description', 'Amount', 'Catergory', 'Owner'];
  setCell(july, 3, A, '2026-07-03');
  setCell(july, 4, A, day(2026, 8, 1));
  setCell(july, 5, A, new Date(Date.UTC(2026, 6, 5, 14, 30)));
  setCell(july, 6, B, 'Coffee\nshop');
  setCell(july, 7, B, 'Gas station ');
  setCell(july, 8, B, `Long description ${'x'.repeat(200)}`);
  setCell(july, 9, B, 42);
  setCell(july, 10, B, null);

  setCell(august, 3, C, '12.50');
  setCell(august, 4, C, 0);
  setCell(august, 5, C, 54.463);
  setCell(august, 6, C, { formula: '10+5.5', result: 15.5 });
  setCell(august, 7, D, 'Car maintenance');
  setCell(august, 8, E, 'Joint ');
  setCell(august, 9, D, 'Income');
  setCell(august, 9, C, 2100);
  august.merges = ['B10:C10'];

  // A blank row at row 12 between transactions; the sheet keeps its 20 transactions.
  september.rows.splice(10, 0, null);

  const workbook = new ExcelJS.Workbook();
  addCategoriesSheet(workbook, true);
  for (const month of [july, august, september]) addMonthSheet(workbook, month);
  workbook.addWorksheet('Notes').addRow(['Remember to check the September totals']);
  return toBytes(workbook);
}

async function main(): Promise<void> {
  mkdirSync(LEGACY_FIXTURE_DIR, { recursive: true });
  writeFileSync(join(LEGACY_FIXTURE_DIR, 'legacy-valid.xlsx'), await buildValidWorkbook());
  console.log('wrote fixtures/legacy/legacy-valid.xlsx');
  writeFileSync(join(LEGACY_FIXTURE_DIR, 'legacy-invalid.xlsx'), await buildInvalidWorkbook());
  console.log('wrote fixtures/legacy/legacy-invalid.xlsx');
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) await main();
