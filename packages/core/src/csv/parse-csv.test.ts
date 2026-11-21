import type { CsvMapping, CsvPresetId } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import { missingCsvColumns, parseCsv, type ParsedOkRow, type ParsedRow } from './parse-csv.js';
import { getCsvPreset } from './presets.js';

/** Bytes of an ASCII string (tests that need other bytes build them by hand). */
const ascii = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0));

const OWNER = { defaultOwnerId: 3 };

const BASE: CsvMapping = {
  encoding: 'utf-8',
  hasHeader: true,
  columns: { date: 'Date', description: ['Desc'], amount: 'Amount' },
  dateFormat: 'yyyy-MM-dd',
  amountSign: 'negative_is_outflow',
  skipZeroAmount: false,
};

function only(rows: ParsedRow[]): ParsedRow {
  expect(rows).toHaveLength(1);
  return rows[0] as ParsedRow;
}

function parsed(rows: ParsedRow[]): ParsedOkRow {
  const row = only(rows);
  if (row.status !== 'parsed') throw new Error(`Expected parsed, got ${row.status}: ${row.reason}`);
  return row;
}

describe('parseCsv', () => {
  it('reads a simple row into normalized fields', () => {
    const row = parsed(
      parseCsv(ascii('Date,Desc,Amount\n2026-10-01,  Corner   Store ,-12.50\n'), BASE, OWNER),
    );
    expect(row).toEqual({
      line: 2,
      raw: { Date: '2026-10-01', Desc: '  Corner   Store ', Amount: '-12.50' },
      status: 'parsed',
      date: '2026-10-01',
      postedDate: null,
      amountCents: -1250,
      description: 'Corner Store',
      memo: null,
      merchantKey: 'CORNER STORE',
      bankCategory: null,
      externalId: null,
      dedupKey: expect.stringMatching(/^[0-9a-f]{64}$/) as unknown,
      ownerHint: null,
      ownerId: 3,
    });
  });

  it('returns nothing for an empty file or a header alone', () => {
    expect(parseCsv(new Uint8Array(), BASE, OWNER)).toEqual([]);
    expect(parseCsv(ascii('Date,Desc,Amount\n'), BASE, OWNER)).toEqual([]);
  });

  it('trims header names and handles CRLF line endings', () => {
    const csv = ' Date , Desc ,Amount \r\n2026-10-01,A,1.00\r\n2026-10-02,B,2.00\r\n';
    const rows = parseCsv(ascii(csv), BASE, OWNER);
    expect(rows.map((r) => r.status === 'parsed' && [r.line, r.date, r.amountCents])).toEqual([
      [2, '2026-10-01', 100],
      [3, '2026-10-02', 200],
    ]);
  });

  it('reads UTF-8 and latin1 descriptions', () => {
    const head = ascii('Date,Desc,Amount\n2026-10-01,Caf');
    const tail = ascii(',-4.00\n');
    const utf8 = new Uint8Array([...head, 0xc3, 0xa9, ...tail]);
    const latin1 = new Uint8Array([...head, 0xe9, ...tail]);
    expect(parsed(parseCsv(utf8, BASE, OWNER)).description).toBe('Café');
    expect(parsed(parseCsv(latin1, { ...BASE, encoding: 'latin1' }, OWNER)).description).toBe(
      'Café',
    );
  });

  it('strips a BOM before reading the header', () => {
    const bytes = new Uint8Array([
      0xef,
      0xbb,
      0xbf,
      ...ascii('Date,Desc,Amount\n2026-10-01,A,1\n'),
    ]);
    expect(parsed(parseCsv(bytes, BASE, OWNER)).amountCents).toBe(100);
  });

  it('flips the sign for positive_is_outflow', () => {
    const mapping: CsvMapping = { ...BASE, amountSign: 'positive_is_outflow' };
    const rows = parseCsv(
      ascii('Date,Desc,Amount\n2026-10-01,A,$30.22\n2026-10-01,B,"-$1,200.00"\n2026-10-01,C,0\n'),
      mapping,
      OWNER,
    );
    expect(rows.map((r) => r.status === 'parsed' && r.amountCents)).toEqual([-3022, 120000, 0]);
    const zero = rows[2];
    expect(zero?.status === 'parsed' && Object.is(zero.amountCents, -0)).toBe(false);
  });

  describe('outflow and inflow columns', () => {
    const mapping: CsvMapping = {
      ...BASE,
      columns: { date: 'Date', description: ['Desc'], outflow: 'Out', inflow: 'In' },
    };
    const parse = (out: string, into: string) =>
      only(parseCsv(ascii(`Date,Desc,Out,In\n2026-10-01,A,${out},${into}\n`), mapping, OWNER));

    it('treats Out as outflow and In as inflow', () => {
      expect(parse('45.99', '')).toMatchObject({ amountCents: -4599 });
      expect(parse('', '400.00')).toMatchObject({ amountCents: 40000 });
      expect(parse('10.00', '2.50')).toMatchObject({ amountCents: -750 });
      expect(parse('-10.00', '')).toMatchObject({ amountCents: -1000 });
    });

    it('reports empty and invalid cells', () => {
      expect(parse('', '')).toMatchObject({
        status: 'error',
        reason: 'Both outflow and inflow are empty',
      });
      expect(parse('x', '')).toMatchObject({
        status: 'error',
        reason: expect.stringContaining('Outflow') as unknown,
      });
      expect(parse('', 'y')).toMatchObject({
        status: 'error',
        reason: expect.stringContaining('Inflow') as unknown,
      });
    });
  });

  it('joins non-empty description columns with one space', () => {
    const mapping: CsvMapping = {
      ...BASE,
      columns: { ...BASE.columns, description: ['D1', 'D2'] },
    };
    const csv =
      'Date,D1,D2,Amount\n2026-10-01,HYDRO BILL PMT,,-1\n2026-10-01, PAYROLL ,NORTHWIND  MFG,1\n2026-10-01,,,1\n';
    const rows = parseCsv(ascii(csv), mapping, OWNER);
    expect(rows[0]).toMatchObject({ description: 'HYDRO BILL PMT' });
    expect(rows[1]).toMatchObject({ description: 'PAYROLL NORTHWIND MFG' });
    expect(rows[2]).toMatchObject({ status: 'error', reason: 'Description is empty' });
  });

  it('reads memo, posted date, external id and bank category', () => {
    const mapping: CsvMapping = {
      ...BASE,
      columns: {
        ...BASE.columns,
        postedDate: 'Posted',
        memo: 'Memo',
        externalId: 'Ref',
        bankCategory: 'Memo',
      },
      bankCategoryRegex: 'Category: (.+)$',
    };
    const csv =
      'Date,Posted,Desc,Memo,Ref,Amount\n' +
      '2026-10-01,2026-10-02,A,Rewards earned: 1.02 ~ Category: Groceries,"""123""",-1\n' +
      '2026-10-01,,B,No category here,,-1\n' +
      '2026-10-01,10/02/2026,C,,,-1\n';
    const rows = parseCsv(ascii(csv), mapping, OWNER);
    expect(rows[0]).toMatchObject({
      postedDate: '2026-10-02',
      memo: 'Rewards earned: 1.02 ~ Category: Groceries',
      bankCategory: 'Groceries',
      externalId: '123',
      dedupKey: '123',
    });
    expect(rows[1]).toMatchObject({ postedDate: null, bankCategory: null, externalId: null });
    expect(rows[2]).toMatchObject({
      status: 'error',
      reason: expect.stringContaining('Posted date') as unknown,
    });
  });

  it('keeps the bank category cell as is without a regex', () => {
    const mapping: CsvMapping = { ...BASE, columns: { ...BASE.columns, bankCategory: 'Cat' } };
    const row = only(
      parseCsv(ascii('Date,Desc,Amount,Cat\n2026-10-01,A,1, Service Stations \n'), mapping, OWNER),
    );
    expect(row).toMatchObject({ bankCategory: 'Service Stations' });
  });

  it('maps owner hints case-insensitively and falls back to the default owner', () => {
    const mapping: CsvMapping = {
      ...BASE,
      columns: { ...BASE.columns, ownerHint: 'Name' },
      ownerHintMap: { 'ALEX SAMPLE': 1, ' jamie sample ': 2 },
    };
    const csv =
      'Date,Desc,Amount,Name\n2026-10-01,A,1,ALEX SAMPLE\n2026-10-01,A,1,Jamie Sample\n2026-10-01,A,1,SAM OTHER\n2026-10-01,A,1,\n';
    const rows = parseCsv(ascii(csv), mapping, OWNER);
    expect(rows.map((r) => r.status === 'parsed' && [r.ownerHint, r.ownerId])).toEqual([
      ['ALEX SAMPLE', 1],
      ['Jamie Sample', 2],
      ['SAM OTHER', 3],
      [null, 3],
    ]);
  });

  describe('skips', () => {
    it('skips zero amounts only when the mapping says so', () => {
      const csv = ascii('Date,Desc,Amount\n2026-10-09,Posted :08 Oct 2026,0.00\n');
      expect(only(parseCsv(csv, { ...BASE, skipZeroAmount: true }, OWNER))).toMatchObject({
        status: 'skipped',
        reason: 'Zero amount',
      });
      expect(only(parseCsv(csv, BASE, OWNER))).toMatchObject({ status: 'parsed', amountCents: 0 });
    });

    it('skips rows by skipWhen notEquals and matches', () => {
      const mapping: CsvMapping = {
        ...BASE,
        skipWhen: [
          { column: 'Status', notEquals: 'APPROVED' },
          { column: 'Desc', matches: '^pending' },
        ],
      };
      const csv =
        'Date,Desc,Amount,Status\n2026-10-01,A,1,APPROVED\n2026-10-01,A,1,DECLINED\n2026-10-01,Pending X,1,APPROVED\n';
      const rows = parseCsv(ascii(csv), mapping, OWNER);
      expect(rows.map((r) => [r.status, 'reason' in r ? r.reason : null])).toEqual([
        ['parsed', null],
        ['skipped', 'Status "DECLINED" is not "APPROVED"'],
        ['skipped', 'Desc "Pending X" matches the skip pattern'],
      ]);
    });

    it('requires both conditions of one skipWhen entry, and ignores an empty entry', () => {
      const mapping: CsvMapping = {
        ...BASE,
        skipWhen: [
          { column: 'Status', notEquals: 'APPROVED', matches: 'DECL' },
          { column: 'Status' },
        ],
      };
      const csv = 'Date,Desc,Amount,Status\n2026-10-01,A,1,PENDING\n2026-10-01,A,1,DECLINED\n';
      expect(parseCsv(ascii(csv), mapping, OWNER).map((r) => r.status)).toEqual([
        'parsed',
        'skipped',
      ]);
    });

    it('skips rows for other accounts when an account filter value is set', () => {
      const mapping: CsvMapping = {
        ...BASE,
        columns: { ...BASE.columns, accountFilter: 'Account' },
        accountFilterValue: '00000-1234567',
      };
      const csv =
        'Account,Date,Desc,Amount\n00000-1234567,2026-10-01,A,1\n00000-7654321,2026-10-01,B,1\n';
      const rows = parseCsv(ascii(csv), mapping, OWNER);
      expect(rows.map((r) => [r.status, 'reason' in r ? r.reason : null])).toEqual([
        ['parsed', null],
        ['skipped', 'Account 00000-7654321 is not 00000-1234567'],
      ]);
      // Without a value the filter column is ignored.
      const noValue: CsvMapping = { ...mapping, accountFilterValue: undefined };
      expect(parseCsv(ascii(csv), noValue, OWNER).map((r) => r.status)).toEqual([
        'parsed',
        'parsed',
      ]);
    });

    it('reports blank lines as skipped', () => {
      const rows = parseCsv(ascii('Date,Desc,Amount\n\n2026-10-01,A,1\n , , \n'), BASE, OWNER);
      expect(rows.map((r) => [r.line, r.status])).toEqual([
        [2, 'skipped'],
        [3, 'parsed'],
        [4, 'skipped'],
      ]);
    });
  });

  describe('errors never throw', () => {
    it('reports bad dates, amounts and row lengths', () => {
      const csv =
        'Date,Desc,Amount\n2026-13-01,A,1\n2026-10-01,A,abc\n2026-10-01,A\n2026-10-01,A,1,extra\n2026-10-01,A,\n';
      const rows = parseCsv(ascii(csv), BASE, OWNER);
      expect(rows.map((r) => [r.line, r.status, 'reason' in r ? r.reason : null])).toEqual([
        [2, 'error', 'Date "2026-13-01" is not a yyyy-MM-dd date'],
        [3, 'error', 'Amount "abc" is not a number with at most 2 decimals'],
        [4, 'error', 'Row has 2 fields, the header has 3'],
        [5, 'error', 'Row has 4 fields, the header has 3'],
        [6, 'error', 'Amount is empty'],
      ]);
    });

    it('reports missing columns on every row', () => {
      const mapping: CsvMapping = { ...BASE, skipWhen: [{ column: 'Status', notEquals: 'X' }] };
      const rows = parseCsv(
        ascii('When,Desc,Amount\n2026-10-01,A,1\n2026-10-02,B,2\n'),
        mapping,
        OWNER,
      );
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row).toMatchObject({ status: 'error', reason: 'Missing column(s): Date, Status' });
      }
    });

    it('reports invalid user patterns on every row', () => {
      const bad: CsvMapping = {
        ...BASE,
        columns: { ...BASE.columns, bankCategory: 'Desc' },
        bankCategoryRegex: '(',
      };
      expect(only(parseCsv(ascii('Date,Desc,Amount\n2026-10-01,A,1\n'), bad, OWNER))).toMatchObject(
        {
          status: 'error',
          reason: 'Invalid bank category pattern: (',
        },
      );
      const badSkip: CsvMapping = { ...BASE, skipWhen: [{ column: 'Desc', matches: '[' }] };
      expect(
        only(parseCsv(ascii('Date,Desc,Amount\n2026-10-01,A,1\n'), badSkip, OWNER)),
      ).toMatchObject({
        status: 'error',
        reason: 'Invalid skip pattern: [',
      });
    });

    it('turns unreadable quoting into error rows and keeps reading', () => {
      const csv =
        'Date,Desc,Amount\n2026-10-01,"bad"x,1\n2026-10-02,a,2\n2026-10-03,"unclosed,3\n2026-10-04,b,4\n';
      const rows = parseCsv(ascii(csv), BASE, OWNER);
      expect(rows.map((r) => [r.line, r.status])).toEqual([
        [2, 'error'],
        [3, 'parsed'],
        [4, 'error'],
        [5, 'parsed'],
      ]);
      expect(rows[0]).toMatchObject({ raw: [] });
      expect(rows[0]?.status === 'error' && rows[0].reason).toMatch(
        /^Unreadable CSV: Invalid Closing Quote/,
      );
      expect(rows[2]?.status === 'error' && rows[2].reason).not.toMatch(/at line/);
    });

    it('reports an unreadable header on every record', () => {
      const rows = parseCsv(ascii('"Da"te,Desc,Amount\n2026-10-01,A,1\n'), BASE, OWNER);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.status).toBe('error');
    });
  });

  it('numbers lines from where a multi-line quoted record starts', () => {
    const csv = 'Date,Desc,Amount\n2026-10-01,"two\nlines",1\n2026-10-02,next,2\n';
    const rows = parseCsv(ascii(csv), BASE, OWNER);
    expect(rows.map((r) => r.status === 'parsed' && [r.line, r.description])).toEqual([
      [2, 'two lines'],
      [4, 'next'],
    ]);
  });

  it('counts a CRLF inside a quoted cell as one line', () => {
    const csv = 'Date,Desc,Amount\r\n2026-10-01,"two\r\nlines",1\r\n2026-10-02,next,2\r\n';
    const rows = parseCsv(ascii(csv), BASE, OWNER);
    expect(rows.map((r) => r.status === 'parsed' && [r.line, r.description])).toEqual([
      [2, 'two lines'],
      [4, 'next'],
    ]);
  });

  it('loses no row after bad quoting that follows a CRLF inside a quoted cell', () => {
    const csv =
      'Date,Desc,Amount\r\n2026-10-01,"a\nb","1"\r\n2026-10-02,"c\r\nd",2\r\n' +
      '2026-10-03,"bad"x,3\r\n2026-10-04,e,4\r\n2026-10-05,f,5\r\n';
    const rows = parseCsv(ascii(csv), BASE, OWNER);
    expect(rows.map((r) => [r.line, r.status])).toEqual([
      [2, 'parsed'],
      [4, 'parsed'],
      [6, 'error'],
      [7, 'parsed'],
      [8, 'parsed'],
    ]);
  });

  it('numbers lines correctly after multi-byte UTF-8 text', () => {
    const csv =
      'Date,Desc,Amount\n2026-10-01,"Café\nCrème",1\n2026-10-02,"bad"x,2\n2026-10-03,ok,3\n';
    // UTF-8 bytes via percent-encoding: core has no TextEncoder type.
    const bytes = Uint8Array.from(encodeURIComponent(csv).match(/%[0-9A-F]{2}|[^%]/g) ?? [], (t) =>
      t.length === 3 ? parseInt(t.slice(1), 16) : t.charCodeAt(0),
    );
    expect(bytes.length).toBeGreaterThan(csv.length);
    const rows = parseCsv(bytes, BASE, OWNER);
    expect(rows.map((r) => [r.line, r.status])).toEqual([
      [2, 'parsed'],
      [4, 'error'],
      [5, 'parsed'],
    ]);
  });

  it('reads headerless files by 1-based column number', () => {
    const mapping: CsvMapping = {
      ...BASE,
      hasHeader: false,
      columns: { date: '1', description: ['2'], amount: '3' },
    };
    const row = only(parseCsv(ascii('2026-10-01,Shop,-5.00\n'), mapping, OWNER));
    expect(row).toMatchObject({
      line: 1,
      status: 'parsed',
      amountCents: -500,
      raw: ['2026-10-01', 'Shop', '-5.00'],
    });
    const missing = { ...mapping, columns: { ...mapping.columns, memo: 'Memo' } };
    expect(only(parseCsv(ascii('2026-10-01,Shop,-5.00\n'), missing, OWNER))).toMatchObject({
      status: 'error',
      reason: 'Missing column(s): Memo',
    });
  });

  it('reads every preset mapping without file-level problems on its own header', () => {
    const headers: Record<string, string> = {
      'tangerine-chequing': 'Date,Transaction,Name,Memo,Amount',
      'tangerine-mastercard': 'Transaction date,Transaction,Name,Memo,Amount',
      simplii: 'Date, Transaction Details, Funds Out, Funds In, Credit Card ',
      'walmart-mastercard':
        'Date,Posted Date,Reference Number,Activity Type,Status,Transaction Card Number,Merchant Category,Merchant Name,Merchant City,Merchant State/Province,Merchant Country,Merchant Postal Code/Zip,Amount,Rewards,Name on Card',
      rbc: 'Account Type,Account Number,Transaction Date,Cheque Number,Description 1,Description 2,CAD$,USD$',
    };
    for (const [id, header] of Object.entries(headers)) {
      const width = header.split(',').length;
      const csv = ascii(`${header}\n${Array(width).fill('x').join(',')}\n`);
      const row = only(parseCsv(csv, getCsvPreset(id as CsvPresetId).mapping, OWNER));
      expect('reason' in row ? row.reason : '').not.toContain('Missing column');
    }
  });
});

describe('missingCsvColumns', () => {
  it('is empty when every mapped column is in the header (names trimmed)', () => {
    expect(missingCsvColumns(ascii(' Date , Desc ,Amount\n2026-10-01,x,1\n'), BASE)).toEqual([]);
  });

  it('names each mapped column the header lacks, in mapping order', () => {
    const mapping: CsvMapping = {
      ...BASE,
      columns: { ...BASE.columns, memo: 'Memo' },
      skipWhen: [{ column: 'Status', notEquals: 'OK' }],
    };
    expect(missingCsvColumns(ascii('When,Desc,Spent\n'), mapping)).toEqual([
      'Date',
      'Memo',
      'Amount',
      'Status',
    ]);
  });

  it('checks column numbers against the first row of a headerless file', () => {
    const mapping: CsvMapping = {
      ...BASE,
      hasHeader: false,
      columns: { date: '1', description: ['2'], amount: '4' },
    };
    expect(missingCsvColumns(ascii('2026-10-01,x,1\n'), mapping)).toEqual(['4']);
    expect(missingCsvColumns(ascii('2026-10-01,x,1,2\n'), mapping)).toEqual([]);
  });

  it('is empty for an empty file or an unreadable first row', () => {
    expect(missingCsvColumns(ascii(''), BASE)).toEqual([]);
    expect(missingCsvColumns(ascii('"Date,Desc\n'), BASE)).toEqual([]);
  });
});
