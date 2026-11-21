import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_RULES, parseLegacyWorkbook } from '../../packages/core/src/index.js';
import {
  buildInvalidWorkbook,
  buildValidWorkbook,
  LEGACY_FIXTURE_DIR,
  PLANTED_VIOLATIONS,
  SHEET_CATEGORIES,
} from '../legacy/generate.js';

// Golden test for the ML legacy importer: fixtures/legacy/legacy-valid.xlsx parses to the
// committed fixtures/expected/legacy-valid.json. Rewrite it after an intended change with
//   UPDATE_GOLDEN=1 pnpm vitest run --project fixtures
// then `pnpm format`, and review the diff.

type LegacyCategory = Parameters<typeof parseLegacyWorkbook>[1][number];

/** The 26 sheet categories with ids 1 to 26 in PLAN.md order; Income is the income kind. */
const CATEGORIES: LegacyCategory[] = Object.keys(SHEET_CATEGORIES).map((name, i) => ({
  id: i + 1,
  name,
  kind: name === 'Income' ? 'income' : name === 'Investing' ? 'savings' : 'expense',
}));
const OWNERS = [
  { id: 1, name: 'Colin' },
  { id: 2, name: 'Emily' },
  { id: 3, name: 'Joint' },
];

const read = (file: string) => readFileSync(join(LEGACY_FIXTURE_DIR, file));
const parse = (bytes: Uint8Array) => parseLegacyWorkbook(bytes, CATEGORIES, OWNERS);
const locate = ({ sheet, row, column, rule }: { [k: string]: unknown }) => ({
  sheet,
  row,
  column,
  rule,
});

describe('legacy-valid.xlsx', () => {
  it('parses to expected/legacy-valid.json', async () => {
    const actual = {
      categories: CATEGORIES,
      owners: OWNERS,
      ...(await parse(read('legacy-valid.xlsx'))),
    };
    const goldenPath = join(import.meta.dirname, 'legacy-valid.json');
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
    }
    expect(existsSync(goldenPath), `missing ${goldenPath}`).toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')));
  });

  it('has 60 valid rows over 3 month sheets, with sign-flipped amounts and no violations', async () => {
    const result = await parse(read('legacy-valid.xlsx'));
    expect(result.violations).toEqual([]);
    expect(result.rows).toHaveLength(60);
    expect(result.rows.every((r) => r.status === 'parsed')).toBe(true);
    expect(result.monthTotals.map((m) => [m.month, m.count])).toEqual([
      ['2026-07', 20],
      ['2026-08', 20],
      ['2026-09', 20],
    ]);
    for (const total of result.monthTotals) {
      const sum = result.rows
        .filter((r) => r.status === 'parsed' && r.date.startsWith(total.month))
        .reduce((s, r) => s + (r.status === 'parsed' ? r.amountCents : 0), 0);
      expect(sum).toBe(-total.sheetTotalCents);
    }
  });

  it('contains income and a refund as money arriving, and two identical rows', async () => {
    const rows = (await parse(read('legacy-valid.xlsx'))).rows.flatMap((r) =>
      r.status === 'parsed' ? [r] : [],
    );
    expect(rows.find((r) => r.description === 'Paycheque Northwind Mfg')).toMatchObject({
      amountCents: 210000,
      categoryId: CATEGORIES.find((c) => c.name === 'Income')?.id,
    });
    expect(rows.find((r) => r.description.startsWith('Refund'))?.amountCents).toBe(8000);
    const tims = rows.filter((r) => r.description === 'Tim Hortons');
    expect(tims.map((r) => r.occurrence)).toEqual([1, 2]);
    expect(tims[0]?.dedupKey).toBe(tims[1]?.dedupKey);
  });

  it('matches what the generator writes', async () => {
    const committed = await parse(read('legacy-valid.xlsx'));
    expect(await parse(await buildValidWorkbook())).toEqual(committed);
  });
});

describe('legacy-invalid.xlsx', () => {
  it('yields exactly one violation per planted violation, naming sheet, row, column and rule', async () => {
    const result = await parse(read('legacy-invalid.xlsx'));
    expect(result.violations.map(locate)).toEqual(PLANTED_VIOLATIONS);
    for (const violation of result.violations) expect(violation.message).not.toBe('');
  });

  it('plants a violation of every rule that a workbook can break', () => {
    const rules = new Set(PLANTED_VIOLATIONS.map((v) => v.rule));
    // file-format and no-month-sheets describe a file that is not such a workbook; they have
    // their own tests in packages/core.
    const expected = Object.values(LEGACY_RULES).filter(
      (r) => r !== 'file-format' && r !== 'no-month-sheets',
    );
    expect([...rules].sort()).toEqual([...expected].sort());
  });

  it('matches what the generator writes', async () => {
    const committed = await parse(read('legacy-invalid.xlsx'));
    expect(await parse(await buildInvalidWorkbook())).toEqual(committed);
  });
});
