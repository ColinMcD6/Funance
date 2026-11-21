import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assignOccurrences,
  getCsvPreset,
  parseCsv,
  type AssignedRow,
  type ParsedOkRow,
  type ParsedRow,
} from '../../packages/core/src/index.js';

// Golden tests for the M2 CSV engine: each fixture in fixtures/csv parses to the committed
// fixtures/expected/<fixture>.json. To rewrite the golden files after an intended change, run
//   UPDATE_GOLDEN=1 pnpm vitest run --project fixtures
// then `pnpm format`, and review the diff.

// @funance/shared is not a dependency of the repo root, so take its types from the core API.
type CsvMapping = Parameters<typeof parseCsv>[1];
type CsvPresetId = Parameters<typeof getCsvPreset>[0];

const CSV_DIR = join(import.meta.dirname, '..', 'csv');
const EXPECTED_DIR = import.meta.dirname;
const OWNER_DEFAULTS = { defaultOwnerId: 3 };

/** The preset each fixture is read with. malformed and wrong-headers use a Tangerine layout. */
const FIXTURE_PRESETS: Record<string, CsvPresetId> = {
  'tangerine-chequing-2026-09.csv': 'tangerine-chequing',
  'tangerine-chequing-2026-10-overlap.csv': 'tangerine-chequing',
  'tangerine-mastercard-2026-10.csv': 'tangerine-mastercard',
  'simplii-visa-2026-10.csv': 'simplii',
  'walmart-mastercard-2026-09.csv': 'walmart-mastercard',
  'rbc-chequing-2026-10.csv': 'rbc',
  'malformed.csv': 'tangerine-chequing',
  'wrong-headers.csv': 'tangerine-chequing',
};

const read = (file: string): Buffer => readFileSync(join(CSV_DIR, file));

function parseFixture(file: string, mapping?: CsvMapping): ParsedRow[] {
  const presetId = FIXTURE_PRESETS[file];
  if (presetId === undefined) throw new Error(`No preset for fixture ${file}`);
  return parseCsv(read(file), mapping ?? getCsvPreset(presetId).mapping, OWNER_DEFAULTS);
}

const parsedOnly = (rows: readonly ParsedRow[]): ParsedOkRow[] =>
  rows.filter((r): r is ParsedOkRow => r.status === 'parsed');

/** Simulates committing an import: how many rows the account then holds per dedup key. */
function countsAfterCommit(
  rows: readonly AssignedRow[],
  before = new Map<string, number>(),
): Map<string, number> {
  const counts = new Map(before);
  for (const row of rows) {
    if (row.status === 'new') counts.set(row.dedupKey, (counts.get(row.dedupKey) ?? 0) + 1);
  }
  return counts;
}

const statusCounts = (rows: readonly { status: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
};

describe('golden files', () => {
  it('cover every fixture', () => {
    const fixtures = readdirSync(CSV_DIR).filter((f) => f.endsWith('.csv'));
    expect(Object.keys(FIXTURE_PRESETS).sort()).toEqual(fixtures.sort());
  });

  for (const [file, presetId] of Object.entries(FIXTURE_PRESETS)) {
    it(`${file} parses to expected/${file}.json`, () => {
      const actual = {
        fixture: file,
        preset: presetId,
        ownerDefaults: OWNER_DEFAULTS,
        rows: parseFixture(file),
      };
      const goldenPath = join(EXPECTED_DIR, `${file}.json`);
      if (process.env.UPDATE_GOLDEN === '1') {
        writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
      }
      expect(existsSync(goldenPath), `missing ${goldenPath}`).toBe(true);
      // Compared as data, so Prettier's formatting of the JSON does not matter.
      expect(actual).toEqual(JSON.parse(readFileSync(goldenPath, 'utf8')));
    });
  }
});

describe('dedup keys', () => {
  it('match node:crypto SHA-256 for every fixture row without an external id', () => {
    let checked = 0;
    for (const file of Object.keys(FIXTURE_PRESETS)) {
      for (const row of parsedOnly(parseFixture(file))) {
        if (row.externalId !== null) {
          expect(row.dedupKey).toBe(row.externalId);
          continue;
        }
        const text = `${row.date}|${row.amountCents}|${row.description.toUpperCase().replace(/\s+/g, ' ').trim()}`;
        expect(row.dedupKey).toBe(createHash('sha256').update(text).digest('hex'));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });
});

describe('Tangerine chequing', () => {
  const rows = parseFixture('tangerine-chequing-2026-09.csv');

  it('skips the zero-amount "Posted :" marker rows and reports them as skipped', () => {
    const skipped = rows.filter((r) => r.status === 'skipped');
    expect(skipped).toHaveLength(2);
    for (const row of skipped) {
      expect(row).toMatchObject({ reason: 'Zero amount' });
      expect(row.raw).toMatchObject({
        Amount: '0.00',
        Name: expect.stringMatching(/^Posted :/) as unknown,
      });
    }
    expect(statusCounts(rows)).toEqual({ parsed: 38, skipped: 2 });
  });

  it('keeps the 0.01 interest row and reads descriptions from Memo', () => {
    const parsed = parsedOnly(rows);
    expect(parsed.filter((r) => r.amountCents === 1)).toHaveLength(1);
    expect(parsed.find((r) => r.date === '2026-09-28' && r.amountCents === 185000)).toMatchObject({
      description: 'EFT Deposit from Northwind Mfg',
      merchantKey: 'EFT DEPOSIT FROM',
    });
  });
});

describe('Tangerine Mastercard', () => {
  it('reads six distinct bank categories from Memo, a refund and the card payment', () => {
    const parsed = parsedOnly(parseFixture('tangerine-mastercard-2026-10.csv'));
    expect(parsed).toHaveLength(40);
    const categories = new Set(parsed.map((r) => r.bankCategory).filter((c) => c !== null));
    expect(categories.size).toBeGreaterThanOrEqual(6);
    expect(parsed.find((r) => r.description === 'PAYMENT - THANK YOU')).toMatchObject({
      amountCents: 150000,
      bankCategory: null,
      memo: null,
    });
    expect(parsed.find((r) => r.description.startsWith('TRAILHEAD OUTFITTERS'))).toMatchObject({
      amountCents: 8000,
      bankCategory: 'Other',
    });
  });
});

describe('Simplii Visa', () => {
  it('trims the stray header spaces and reads quoted descriptions containing commas', () => {
    const rows = parseFixture('simplii-visa-2026-10.csv');
    expect(statusCounts(rows)).toEqual({ parsed: 15 });
    const parsed = parsedOnly(rows);
    expect(parsed[0]).toMatchObject({
      description: 'SAFEWAY #1234, WINNIPEG MB',
      amountCents: -6529,
      merchantKey: 'SAFEWAY WINNIPEG MB',
    });
    expect(parsed.find((r) => r.description.startsWith('AMZN'))).toMatchObject({
      description: 'AMZN Mktp CA*AB1CD2EF3 866-216-1072, ON',
      merchantKey: 'AMZN MKTP CA',
      amountCents: -4599,
    });
    expect(parsed.find((r) => r.description.startsWith('PAYMENT THANK YOU'))).toMatchObject({
      amountCents: 40000,
    });
  });
});

describe('Walmart Mastercard', () => {
  const preset = getCsvPreset('walmart-mastercard').mapping;

  it('yields external ids without quote characters', () => {
    const parsed = parsedOnly(parseFixture('walmart-mastercard-2026-09.csv'));
    const withIds = parsed.filter((r) => r.externalId !== null);
    expect(withIds.length).toBeGreaterThan(20);
    for (const row of withIds) {
      expect(row.externalId).toMatch(/^[0-9-]+$/);
      expect(row.externalId).not.toContain('"');
      expect(row.dedupKey).toBe(row.externalId);
    }
    expect(parsed.find((r) => r.externalId === '11111111111111111111111')).toMatchObject({
      date: '2026-09-16',
      postedDate: '2026-09-17',
      amountCents: -3022,
      bankCategory: 'Grocery Stores and Supermarkets',
    });
  });

  it('maps two cardholder names to two owners through the owner hint map', () => {
    const mapping: CsvMapping = {
      ...preset,
      ownerHintMap: { 'ALEX SAMPLE': 1, 'JAMIE SAMPLE': 2 },
    };
    const parsed = parsedOnly(parseFixture('walmart-mastercard-2026-09.csv', mapping));
    const owners = new Map(parsed.map((r) => [r.ownerHint, r.ownerId]));
    expect(owners).toEqual(
      new Map([
        ['JAMIE SAMPLE', 2],
        ['ALEX SAMPLE', 1],
      ]),
    );
    expect(new Set(parsed.map((r) => r.ownerId))).toEqual(new Set([1, 2]));
  });

  it('gives every row the default owner with the seeded empty map', () => {
    const parsed = parsedOnly(parseFixture('walmart-mastercard-2026-09.csv'));
    expect(new Set(parsed.map((r) => r.ownerId))).toEqual(new Set([3]));
  });

  it('skips the DECLINED row, hashes the interest row and reads the payment as an inflow', () => {
    const rows = parseFixture('walmart-mastercard-2026-09.csv');
    expect(rows.filter((r) => r.status === 'skipped')).toEqual([
      expect.objectContaining({ reason: 'Status "DECLINED" is not "APPROVED"' }),
    ]);
    const parsed = parsedOnly(rows);
    expect(parsed.find((r) => r.description === 'PURCHASE INTEREST')).toMatchObject({
      externalId: null,
      amountCents: -31,
      dedupKey: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
    });
    const payment = parsed.find((r) => r.externalId === '2222222222222222222-222');
    expect(payment).toMatchObject({ amountCents: 120000, description: 'PAYMENT - THANK YOU' });
  });
});

describe('RBC', () => {
  it('joins Description 1 and 2, and filters by account number when one is set', () => {
    const preset = getCsvPreset('rbc').mapping;
    const all = parseFixture('rbc-chequing-2026-10.csv');
    expect(statusCounts(all)).toEqual({ parsed: 30 });
    const parsed = parsedOnly(all);
    expect(parsed.find((r) => r.amountCents === 210000)).toMatchObject({
      description: 'PAYROLL DEPOSIT NORTHWIND MFG',
    });
    expect(parsed.find((r) => r.amountCents === -14376)).toMatchObject({
      description: 'HYDRO BILL PMT',
    });

    const filtered = parseFixture('rbc-chequing-2026-10.csv', {
      ...preset,
      accountFilterValue: '00000-1234567',
    });
    const counts = statusCounts(filtered);
    expect(counts.parsed).toBeGreaterThan(0);
    expect(counts.skipped).toBeGreaterThan(0);
    expect((counts.parsed ?? 0) + (counts.skipped ?? 0)).toBe(30);
    for (const row of filtered) {
      const account = (row.raw as Record<string, string>)['Account Number'];
      expect(row.status).toBe(account === '00000-1234567' ? 'parsed' : 'skipped');
    }
  });
});

describe('malformed input', () => {
  it('produces error rows with reasons and does not throw', () => {
    const rows = parseFixture('malformed.csv');
    expect(rows).toHaveLength(8);
    const problems = rows
      .filter((r) => r.status !== 'parsed')
      .map((r) => [r.line, r.status, 'reason' in r ? r.reason : null]);
    expect(problems).toEqual([
      [3, 'error', 'Date "13/45/2026" is not a MM/dd/yyyy date'],
      [4, 'error', 'Amount "abc" is not a number with at most 2 decimals'],
      [5, 'error', 'Row has 3 fields, the header has 5'],
      [6, 'skipped', 'Blank line'],
    ]);
    expect(statusCounts(rows)).toEqual({ parsed: 4, error: 3, skipped: 1 });
  });

  it('reports missing columns on every row of a file matching no preset', () => {
    for (const { id, mapping } of [
      'tangerine-chequing',
      'tangerine-mastercard',
      'simplii',
      'walmart-mastercard',
      'rbc',
    ].map((id) => ({ id, mapping: getCsvPreset(id as CsvPresetId).mapping }))) {
      const rows = parseCsv(read('wrong-headers.csv'), mapping, OWNER_DEFAULTS);
      expect(rows, id).toHaveLength(5);
      for (const row of rows) {
        expect(row.status, id).toBe('error');
        expect('reason' in row && row.reason, id).toMatch(/^Missing column\(s\): /);
      }
    }
  });
});

describe('occurrences', () => {
  it('importing the same file twice gives zero new rows', () => {
    const rows = parseFixture('tangerine-chequing-2026-09.csv');
    const first = assignOccurrences(rows, new Map());
    expect(statusCounts(first)).toEqual({ new: 38, skipped: 2 });
    const second = assignOccurrences(rows, countsAfterCommit(first));
    expect(statusCounts(second)).toEqual({ duplicate: 38, skipped: 2 });
  });

  it('the overlapping pair inserts only the 25 new rows (24 after the skipped marker row)', () => {
    const september = assignOccurrences(parseFixture('tangerine-chequing-2026-09.csv'), new Map());
    const overlap = assignOccurrences(
      parseFixture('tangerine-chequing-2026-10-overlap.csv'),
      countsAfterCommit(september),
    );
    expect(statusCounts(overlap)).toEqual({ duplicate: 10, new: 24, skipped: 1 });
    // The ten duplicates are exactly the first ten rows: the last ten of the September file.
    expect(overlap.slice(0, 10).every((r) => r.status === 'duplicate')).toBe(true);
    expect(overlap.slice(10).some((r) => r.status === 'duplicate')).toBe(false);
  });

  it('four identical same-day rows against two existing gives two new', () => {
    const rows = parseFixture('tangerine-mastercard-2026-10.csv');
    const byKey = new Map<string, number>();
    for (const r of parsedOnly(rows)) byKey.set(r.dedupKey, (byKey.get(r.dedupKey) ?? 0) + 1);
    const repeated = [...byKey].filter(([, n]) => n === 4).map(([key]) => key);
    expect(repeated).toHaveLength(1);
    const [key] = repeated;
    if (key === undefined) throw new Error('no repeated key');

    const assigned = assignOccurrences(rows, new Map([[key, 2]]));
    const same = assigned.filter(
      (r) => r.status !== 'skipped' && r.status !== 'error' && r.dedupKey === key,
    );
    expect(same.map((r) => [r.status, 'occurrence' in r ? r.occurrence : null])).toEqual([
      ['duplicate', 1],
      ['duplicate', 2],
      ['new', 3],
      ['new', 4],
    ]);
    expect(statusCounts(assigned)).toEqual({ new: 38, duplicate: 2 });
  });
});
