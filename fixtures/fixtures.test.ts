import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CSV_FIXTURE_DIR, generateFixtures } from './generate.js';

// Header rows copied from PLAN.md section 6, byte for byte. The Simplii header's spaces and
// trailing space are intentional, and the Walmart file starts with a UTF-8 BOM.
const HEADERS: Record<string, string> = {
  'tangerine-chequing-2026-09.csv': 'Date,Transaction,Name,Memo,Amount',
  'tangerine-chequing-2026-10-overlap.csv': 'Date,Transaction,Name,Memo,Amount',
  'tangerine-mastercard-2026-10.csv': 'Transaction date,Transaction,Name,Memo,Amount',
  'simplii-visa-2026-10.csv': 'Date, Transaction Details, Funds Out, Funds In, Credit Card ',
  'walmart-mastercard-2026-09.csv':
    '\uFEFF"Date","Posted Date","Reference Number","Activity Type","Status","Transaction Card Number","Merchant Category","Merchant Name","Merchant City","Merchant State/Province","Merchant Country","Merchant Postal Code/Zip","Amount","Rewards","Name on Card"',
  'rbc-chequing-2026-10.csv':
    '"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"',
};

// Example rows from PLAN.md section 6, which must appear exactly.
const EXAMPLE_ROWS: Record<string, string[]> = {
  'tangerine-chequing-2026-09.csv': [
    '09/28/2026,OTHER,EFT Deposit from Northwind Mfg,EFT Deposit from Northwind Mfg,1850.00',
  ],
  'tangerine-chequing-2026-10-overlap.csv': [
    '10/05/2026,OTHER,Interac - Purchase - SHELL C1234,Interac - Purchase - SHELL C12345 WINNIPEG  MB  CA,-61.20',
    '10/09/2026,OTHER,Posted :08 Oct 2026,Posted :08 Oct 2026,0.00',
  ],
  'tangerine-mastercard-2026-10.csv': [
    '10/30/2026,DEBIT,COSTCO WHOLESALE W1234 WINNIPEG MB,Rewards earned: 1.02 ~ Category: Groceries,-204.11',
    '10/26/2026,CREDIT,PAYMENT - THANK YOU,,1500.00',
    '10/22/2026,CREDIT,TRAILHEAD OUTFITTERS London ON,Rewards earned: -0.40 ~ Category: Other,80.00',
  ],
  'simplii-visa-2026-10.csv': [
    '10/19/2026,"AMZN Mktp CA*AB1CD2EF3 866-216-1072, ON",45.99,,4500********0000',
    '10/23/2026,PAYMENT THANK YOU/PAIEMEN T MERCI,,400.00,4500********0000',
  ],
  'walmart-mastercard-2026-09.csv': [
    '"2026-09-16","2026-09-17","""11111111111111111111111""","TRANS","APPROVED","************0002","Grocery Stores and Supermarkets","WAL-MART #1234","WINNIPEG","MB","CAN","R0R 0R0","$30.22","","JAMIE SAMPLE"',
    '"2026-09-21","2026-09-22","""2222222222222222222-222""","TRANS","APPROVED","************0001","","PAYMENT - THANK YOU","","","","","-$1,200.00","","ALEX SAMPLE"',
    '"2026-10-02","2026-10-02","","TRANS","APPROVED","************0001","","PURCHASE INTEREST","","","","","$0.31","","ALEX SAMPLE"',
  ],
  'rbc-chequing-2026-10.csv': [
    'Chequing,00000-1234567,10/3/2026,,"PAYROLL DEPOSIT","NORTHWIND MFG",2100.00,',
    'Chequing,00000-1234567,10/5/2026,,"HYDRO BILL PMT",,-143.76,',
  ],
};

// Data rows per file (excluding the header), from the PLAN.md section 6 table.
const ROW_COUNTS: Record<string, number> = {
  'tangerine-chequing-2026-09.csv': 40,
  'tangerine-chequing-2026-10-overlap.csv': 35,
  'tangerine-mastercard-2026-10.csv': 40,
  'simplii-visa-2026-10.csv': 15,
  'walmart-mastercard-2026-09.csv': 30,
  'rbc-chequing-2026-10.csv': 30,
  'malformed.csv': 8,
  'wrong-headers.csv': 5,
};

function readFixture(name: string): string {
  return readFileSync(join(CSV_FIXTURE_DIR, name), 'utf8');
}

/** The file's lines without the final newline. */
function fileLines(name: string): string[] {
  return readFixture(name).replace(/\n$/, '').split('\n');
}

function dataLines(name: string): string[] {
  return fileLines(name).slice(1);
}

/** Splits one CSV line into fields (RFC 4180 quoting; enough for these single-line rows). */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      fields.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  fields.push(field);
  return fields;
}

function records(name: string): Record<string, string>[] {
  const [header = '', ...rows] = fileLines(name);
  const columns = splitCsvLine(header.replace(/^\uFEFF/, '')).map((c) => c.trim());
  return rows.map((row) => {
    const fields = splitCsvLine(row);
    return Object.fromEntries(columns.map((c, i) => [c, fields[i] ?? '']));
  });
}

describe('fixtures/csv', () => {
  const generated = generateFixtures();

  it('contains exactly the generated files, byte for byte (rerun pnpm fixtures:generate)', () => {
    expect(readdirSync(CSV_FIXTURE_DIR).sort()).toEqual(Object.keys(generated).sort());
    for (const [name, content] of Object.entries(generated)) {
      expect(
        readFileSync(join(CSV_FIXTURE_DIR, name)).equals(Buffer.from(content, 'utf8')),
        name,
      ).toBe(true);
    }
  });

  it('is deterministic', () => {
    expect(generateFixtures()).toEqual(generated);
  });

  it.each(Object.entries(HEADERS))(
    '%s has the PLAN.md header row byte for byte',
    (name, header) => {
      const bytes = readFileSync(join(CSV_FIXTURE_DIR, name));
      const firstLine = bytes.subarray(0, bytes.indexOf(0x0a));
      expect(firstLine.equals(Buffer.from(header, 'utf8'))).toBe(true);
    },
  );

  it('starts only the Walmart file with a BOM', () => {
    for (const name of Object.keys(generated)) {
      const bom = readFileSync(join(CSV_FIXTURE_DIR, name)).subarray(0, 3);
      expect(bom.equals(Buffer.from([0xef, 0xbb, 0xbf])), name).toBe(
        name === 'walmart-mastercard-2026-09.csv',
      );
    }
  });

  it.each(Object.entries(EXAMPLE_ROWS))('%s contains the PLAN.md example rows', (name, rows) => {
    const lines = dataLines(name);
    for (const row of rows) expect(lines).toContain(row);
  });

  it.each(Object.entries(ROW_COUNTS))('%s has %i data rows', (name, count) => {
    expect(dataLines(name)).toHaveLength(count);
  });

  it('only uses the invented cardholders', () => {
    const names = new Set(records('walmart-mastercard-2026-09.csv').map((r) => r['Name on Card']));
    expect([...names].sort()).toEqual(['ALEX SAMPLE', 'JAMIE SAMPLE']);
  });
});

describe('fixture contents (PLAN.md section 6, "Must contain")', () => {
  it('tangerine chequing September', () => {
    const rows = records('tangerine-chequing-2026-09.csv');
    expect(rows.filter((r) => r.Memo === 'EFT Deposit from Northwind Mfg')).toHaveLength(2);
    expect(rows.filter((r) => r.Memo?.startsWith('INTERAC e-Transfer From:'))).toHaveLength(1);
    expect(rows.filter((r) => r.Memo?.includes('Credit Card Payment'))).toHaveLength(1);
    expect(rows.filter((r) => r.Memo?.startsWith('ABM Withdrawal'))).toHaveLength(1);
    const posted = rows.filter((r) => r.Memo?.startsWith('Posted :'));
    expect(posted).toHaveLength(2);
    expect(posted.every((r) => r.Amount === '0.00')).toBe(true);
    expect(rows.filter((r) => r.Amount === '0.01')).toHaveLength(1);
    // Name is the first 32 characters of Memo.
    for (const r of rows) expect(r.Memo?.startsWith(r.Name ?? '')).toBe(true);
    // Dates are ascending, so "the last 10 rows" are the latest ones.
    const isoDates = rows.map((r) => {
      const [m, d, y] = (r.Date ?? '').split('/');
      return `${y}-${m}-${d}`;
    });
    expect(isoDates).toEqual([...isoDates].sort());
    expect(isoDates.every((d) => d.startsWith('2026-09-'))).toBe(true);
  });

  it('tangerine chequing overlap: the last 10 September rows plus 25 new rows', () => {
    const september = dataLines('tangerine-chequing-2026-09.csv');
    const overlap = dataLines('tangerine-chequing-2026-10-overlap.csv');
    expect(overlap.slice(0, 10)).toEqual(september.slice(-10));
    const fresh = overlap.slice(10);
    expect(fresh).toHaveLength(25);
    expect(fresh.every((line) => line.startsWith('10/') && !september.includes(line))).toBe(true);
  });

  it('tangerine mastercard', () => {
    const lines = dataLines('tangerine-mastercard-2026-10.csv');
    const counts = new Map<string, number>();
    for (const line of lines) counts.set(line, (counts.get(line) ?? 0) + 1);
    expect([...counts.values()].filter((n) => n === 4)).toHaveLength(1);
    expect([...counts.values()].every((n) => n === 1 || n === 4)).toBe(true);

    const rows = records('tangerine-mastercard-2026-10.csv');
    const credits = rows.filter((r) => r.Transaction === 'CREDIT');
    expect(credits.map((r) => r.Name).sort()).toEqual([
      'PAYMENT - THANK YOU',
      'TRAILHEAD OUTFITTERS London ON',
    ]);
    expect(credits.every((r) => !(r.Amount ?? '').startsWith('-'))).toBe(true);
    const categories = new Set(
      rows.flatMap((r) => /Category: (.+)$/.exec(r.Memo ?? '')?.slice(1) ?? []),
    );
    expect(categories.size).toBe(6);
  });

  it('simplii visa', () => {
    const lines = dataLines('simplii-visa-2026-10.csv');
    expect(lines.filter((l) => /^[^,]+,"[^"]*,[^"]*",/.test(l)).length).toBeGreaterThanOrEqual(2);
    const rows = records('simplii-visa-2026-10.csv');
    const payments = rows.filter((r) => r['Funds In'] !== '');
    expect(payments).toHaveLength(1);
    expect(payments[0]?.['Funds Out']).toBe('');
  });

  it('walmart mastercard', () => {
    const rows = records('walmart-mastercard-2026-09.csv');
    expect(rows.filter((r) => r.Status === 'DECLINED')).toHaveLength(1);
    expect(rows.filter((r) => r.Status !== 'APPROVED' && r.Status !== 'DECLINED')).toHaveLength(0);
    const interest = rows.filter((r) => r['Merchant Name'] === 'PURCHASE INTEREST');
    expect(interest).toHaveLength(1);
    expect(interest[0]?.['Reference Number']).toBe('');
    const bigPayments = rows.filter((r) => /^-\$\d{1,3}(,\d{3})+\.\d{2}$/.test(r.Amount ?? ''));
    expect(bigPayments.length).toBeGreaterThanOrEqual(1);
    // Every non-empty reference is wrapped in literal quote characters.
    for (const r of rows) {
      const ref = r['Reference Number'] ?? '';
      if (ref !== '') expect(ref).toMatch(/^"[0-9-]+"$/);
    }
  });

  it('rbc chequing', () => {
    const rows = records('rbc-chequing-2026-10.csv');
    expect(new Set(rows.map((r) => r['Account Number']))).toEqual(
      new Set(['00000-1234567', '00000-7654321']),
    );
    expect(rows.filter((r) => r['Description 2'] === '').length).toBeGreaterThanOrEqual(2);
    expect(rows.every((r) => /^10\/\d{1,2}\/2026$/.test(r['Transaction Date'] ?? ''))).toBe(true);
  });

  it('malformed', () => {
    const lines = dataLines('malformed.csv');
    expect(lines).toContain('');
    expect(lines.some((l) => l.startsWith('13/45/2026,'))).toBe(true);
    expect(lines.some((l) => l.endsWith(',abc'))).toBe(true);
    expect(lines.some((l) => l !== '' && splitCsvLine(l).length < 5)).toBe(true);
  });

  it('wrong headers match no preset column set', () => {
    const [header = ''] = fileLines('wrong-headers.csv');
    for (const known of Object.values(HEADERS)) expect(header).not.toBe(known);
    expect(header.split(',')).not.toContain('Date');
  });
});
