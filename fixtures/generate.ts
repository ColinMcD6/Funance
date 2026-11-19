// Seeded generator for the synthetic bank statements in fixtures/csv (PLAN.md section 6).
// Run `pnpm fixtures:generate` to rewrite them; fixtures.test.ts fails if the committed files
// differ from what this script produces. Every name, card number and reference is invented.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  const digits = (n: number) => Array.from({ length: n }, () => String(int(0, 9))).join('');
  return { int, pick, digits };
}

/** 1234 cents -> "12.34", -1234 -> "-12.34". */
function decimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 120000 -> "$1,200.00", -120000 -> "-$1,200.00" (the Walmart style). */
function dollars(cents: number): string {
  const [whole = '0', fraction = '00'] = decimal(Math.abs(cents)).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${cents < 0 ? '-' : ''}$${grouped}.${fraction}`;
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const mmddyyyy = (y: number, m: number, d: number) => `${pad2(m)}/${pad2(d)}/${y}`;
const mdyyyy = (y: number, m: number, d: number) => `${m}/${d}/${y}`;
const isoDate = (y: number, m: number, d: number) => `${y}-${pad2(m)}-${pad2(d)}`;

/** Quotes a CSV field always (Walmart style), doubling inner quotes. */
const q = (value: string) => `"${value.replace(/"/g, '""')}"`;
/** Quotes a CSV field only when it needs it. */
const qIfNeeded = (value: string) => (/[",\n]/.test(value) ? q(value) : value);

const lines = (rows: readonly string[]) => rows.map((r) => `${r}\n`).join('');

// ---- Tangerine chequing ----

const TANGERINE_CHEQUING_HEADER = 'Date,Transaction,Name,Memo,Amount';

type DatedRow = { sortKey: string; line: string };

function tangerineChequingRow(y: number, m: number, d: number, memo: string, cents: number) {
  // Tangerine truncates the Name column to 32 characters; Memo holds the full text.
  const name = memo.slice(0, 32).trimEnd();
  return {
    sortKey: isoDate(y, m, d),
    line: [mmddyyyy(y, m, d), 'OTHER', qIfNeeded(name), qIfNeeded(memo), decimal(cents)].join(','),
  };
}

const CHEQUING_MERCHANTS = [
  'Interac - Purchase - SOBEYS 4567 WINNIPEG  MB  CA',
  'Interac - Purchase - SHELL C12345 WINNIPEG  MB  CA',
  'Interac - Purchase - DOLLARAMA 1102 WINNIPEG  MB  CA',
  'Interac - Purchase - TIM HORTONS 0871 WINNIPEG  MB  CA',
  'Visa Debit - Purchase - UBER CANADA/UBERTRIP TORONTO  ON  CA',
  'Visa Debit - Purchase - NETFLIX.COM 866-579-7172  ON  CA',
  'Interac - Purchase - MCNALLY ROBINSON BOOKS WINNIPEG  MB  CA',
  'Interac - Purchase - PHARMASAVE 233 WINNIPEG  MB  CA',
];

function tangerineChequingPurchases(
  rng: ReturnType<typeof createRng>,
  y: number,
  m: number,
  count: number,
): DatedRow[] {
  return Array.from({ length: count }, () =>
    tangerineChequingRow(y, m, rng.int(1, 27), rng.pick(CHEQUING_MERCHANTS), -rng.int(300, 9500)),
  );
}

function sortRows(rows: DatedRow[], direction: 'asc' | 'desc' = 'asc'): string[] {
  const sorted = [...rows].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return (direction === 'asc' ? sorted : sorted.reverse()).map((r) => r.line);
}

function tangerineChequingSeptemberRows(): string[] {
  const rng = createRng(202609);
  const rows: DatedRow[] = [
    tangerineChequingRow(2026, 9, 14, 'EFT Deposit from Northwind Mfg', 185000),
    // PLAN.md example row, reproduced exactly.
    tangerineChequingRow(2026, 9, 28, 'EFT Deposit from Northwind Mfg', 185000),
    tangerineChequingRow(2026, 9, 6, 'INTERAC e-Transfer From: JAMIE SAMPLE', 25000),
    tangerineChequingRow(2026, 9, 24, 'Credit Card Payment - Tangerine Mastercard', -125000),
    tangerineChequingRow(2026, 9, 11, 'ABM Withdrawal - 1200 MAIN ST WINNIPEG MB', -10000),
    tangerineChequingRow(2026, 9, 9, 'Posted :08 Sep 2026', 0),
    tangerineChequingRow(2026, 9, 23, 'Posted :22 Sep 2026', 0),
    tangerineChequingRow(2026, 9, 30, 'Interest Paid', 1),
    ...tangerineChequingPurchases(rng, 2026, 9, 32),
  ];
  return sortRows(rows);
}

function tangerineChequingOctoberRows(): string[] {
  const rng = createRng(202610);
  const rows: DatedRow[] = [
    tangerineChequingRow(2026, 10, 12, 'EFT Deposit from Northwind Mfg', 185000),
    // PLAN.md example rows, reproduced exactly.
    {
      sortKey: '2026-10-05',
      line: '10/05/2026,OTHER,Interac - Purchase - SHELL C1234,Interac - Purchase - SHELL C12345 WINNIPEG  MB  CA,-61.20',
    },
    tangerineChequingRow(2026, 10, 9, 'Posted :08 Oct 2026', 0),
    tangerineChequingRow(2026, 10, 20, 'INTERAC e-Transfer To: ALEX SAMPLE', -4000),
    ...tangerineChequingPurchases(rng, 2026, 10, 21),
  ];
  return sortRows(rows);
}

// ---- Tangerine Mastercard ----

const TANGERINE_MASTERCARD_HEADER = 'Transaction date,Transaction,Name,Memo,Amount';

function rewardsMemo(cents: number, category: string): string {
  // 0.5% back, negative on a refund.
  const rewards = Math.round(Math.abs(cents) / 200) * (cents < 0 ? 1 : -1);
  return `Rewards earned: ${decimal(rewards)} ~ Category: ${category}`;
}

function mastercardRow(
  d: number,
  kind: 'DEBIT' | 'CREDIT',
  name: string,
  memo: string,
  cents: number,
) {
  return {
    sortKey: isoDate(2026, 10, d),
    line: [mmddyyyy(2026, 10, d), kind, qIfNeeded(name), qIfNeeded(memo), decimal(cents)].join(','),
  };
}

const MASTERCARD_MERCHANTS: readonly (readonly [string, string])[] = [
  ['SAFEWAY #4812 WINNIPEG MB', 'Groceries'],
  ['COSTCO WHOLESALE W1234 WINNIPEG MB', 'Groceries'],
  ['LAKESIDE BISTRO WINNIPEG MB', 'Restaurants'],
  ['GREEN BEAN CAFE WINNIPEG MB', 'Restaurants'],
  ['WINNIPEG TRANSIT FARE WINNIPEG MB', 'Transportation'],
  ['CINEPLEX 7788 WINNIPEG MB', 'Entertainment'],
  ['PETRO-CANADA 0456 WINNIPEG MB', 'Fuel'],
  ['CANADIAN TIRE #0233 WINNIPEG MB', 'Other'],
];

function tangerineMastercardRows(): string[] {
  const rng = createRng(202611);
  const debit = (d: number, name: string, category: string, cents: number) =>
    mastercardRow(d, 'DEBIT', name, rewardsMemo(-cents, category), -cents);
  const uber = debit(17, 'UBER CANADA/UBERTRIP TORONTO ON', 'Transportation', 1234);
  const rows: DatedRow[] = [
    // PLAN.md example rows, reproduced exactly.
    {
      sortKey: '2026-10-30',
      line: '10/30/2026,DEBIT,COSTCO WHOLESALE W1234 WINNIPEG MB,Rewards earned: 1.02 ~ Category: Groceries,-204.11',
    },
    { sortKey: '2026-10-26', line: '10/26/2026,CREDIT,PAYMENT - THANK YOU,,1500.00' },
    {
      sortKey: '2026-10-22',
      line: '10/22/2026,CREDIT,TRAILHEAD OUTFITTERS London ON,Rewards earned: -0.40 ~ Category: Other,80.00',
    },
    // Four identical same-day rows: legitimate repeats, not duplicates.
    uber,
    uber,
    uber,
    uber,
    ...Array.from({ length: 33 }, () => {
      const [name, category] = rng.pick(MASTERCARD_MERCHANTS);
      return debit(rng.int(1, 29), name, category, rng.int(450, 18000));
    }),
  ];
  return sortRows(rows, 'desc');
}

// ---- Simplii Visa ----

// The spaces after commas and the trailing space are in the real export.
const SIMPLII_HEADER = 'Date, Transaction Details, Funds Out, Funds In, Credit Card ';
const SIMPLII_CARD = '4500********0000';

const SIMPLII_MERCHANTS = [
  'SAFEWAY #1234, WINNIPEG MB',
  'LITTLE SPROUTS BABY SHOP WINNIPEG MB',
  'PAWS AND CLAWS, PET SUPPLY',
  'SHOPPERS DRUG MART #0421 WINNIPEG',
  'SPOTIFY P1A2B3C4D5 STOCKHOLM',
  'HOME DEPOT #7051, WINNIPEG MB',
];

function simpliiRows(): string[] {
  const rng = createRng(202612);
  const row = (d: number, details: string, out: string, inflow: string) => ({
    sortKey: isoDate(2026, 10, d),
    line: [mmddyyyy(2026, 10, d), qIfNeeded(details), out, inflow, SIMPLII_CARD].join(','),
  });
  const rows: DatedRow[] = [
    // PLAN.md example rows, reproduced exactly.
    {
      sortKey: '2026-10-19',
      line: `10/19/2026,"AMZN Mktp CA*AB1CD2EF3 866-216-1072, ON",45.99,,${SIMPLII_CARD}`,
    },
    {
      sortKey: '2026-10-23',
      line: `10/23/2026,PAYMENT THANK YOU/PAIEMEN T MERCI,,400.00,${SIMPLII_CARD}`,
    },
    ...Array.from({ length: 13 }, () =>
      row(rng.int(1, 30), rng.pick(SIMPLII_MERCHANTS), decimal(rng.int(500, 15000)), ''),
    ),
  ];
  return sortRows(rows);
}

// ---- Walmart Mastercard ----

const WALMART_HEADER =
  '"Date","Posted Date","Reference Number","Activity Type","Status","Transaction Card Number","Merchant Category","Merchant Name","Merchant City","Merchant State/Province","Merchant Country","Merchant Postal Code/Zip","Amount","Rewards","Name on Card"';

const CARDHOLDERS = [
  { name: 'ALEX SAMPLE', card: '************0001' },
  { name: 'JAMIE SAMPLE', card: '************0002' },
] as const;

const WALMART_MERCHANTS: readonly (readonly [string, string])[] = [
  ['WAL-MART #1234', 'Grocery Stores and Supermarkets'],
  ['WAL-MART #3177', 'Grocery Stores and Supermarkets'],
  ['GIANT TIGER #212', 'Discount Stores'],
  ['ESSO 4410', 'Service Stations'],
  ['BOSTON PIZZA 0093', 'Eating Places and Restaurants'],
  ['WINNERS #0418', 'Family Clothing Stores'],
];

function walmartRow(fields: {
  date: string;
  posted: string;
  reference: string;
  status: string;
  cardholder: (typeof CARDHOLDERS)[number];
  category: string;
  merchant: string;
  city: string;
  province: string;
  country: string;
  postal: string;
  cents: number;
}) {
  return {
    sortKey: fields.date,
    line: [
      fields.date,
      fields.posted,
      // The reference arrives wrapped in literal quote characters.
      fields.reference === '' ? '' : `"${fields.reference}"`,
      'TRANS',
      fields.status,
      fields.cardholder.card,
      fields.category,
      fields.merchant,
      fields.city,
      fields.province,
      fields.country,
      fields.postal,
      dollars(fields.cents),
      '',
      fields.cardholder.name,
    ]
      .map(q)
      .join(','),
  };
}

function walmartRows(): string[] {
  const rng = createRng(202613);
  const [alex, jamie] = CARDHOLDERS;
  const rows: DatedRow[] = [
    // PLAN.md example rows, reproduced exactly.
    {
      sortKey: '2026-09-16',
      line: '"2026-09-16","2026-09-17","""11111111111111111111111""","TRANS","APPROVED","************0002","Grocery Stores and Supermarkets","WAL-MART #1234","WINNIPEG","MB","CAN","R0R 0R0","$30.22","","JAMIE SAMPLE"',
    },
    {
      sortKey: '2026-09-21',
      line: '"2026-09-21","2026-09-22","""2222222222222222222-222""","TRANS","APPROVED","************0001","","PAYMENT - THANK YOU","","","","","-$1,200.00","","ALEX SAMPLE"',
    },
    {
      sortKey: '2026-10-02',
      line: '"2026-10-02","2026-10-02","","TRANS","APPROVED","************0001","","PURCHASE INTEREST","","","","","$0.31","","ALEX SAMPLE"',
    },
  ];
  for (let i = 0; i < 27; i++) {
    const day = rng.int(1, 28);
    const [merchant, category] = rng.pick(WALMART_MERCHANTS);
    rows.push(
      walmartRow({
        date: isoDate(2026, 9, day),
        posted: isoDate(2026, 9, day + 1),
        reference: rng.digits(23),
        // Exactly one declined row, which the preset skips.
        status: i === 5 ? 'DECLINED' : 'APPROVED',
        cardholder: i % 3 === 0 ? alex : jamie,
        category,
        merchant,
        city: 'WINNIPEG',
        province: 'MB',
        country: 'CAN',
        postal: 'R0R 0R0',
        cents: rng.int(250, 25000),
      }),
    );
  }
  return sortRows(rows);
}

// ---- RBC ----

const RBC_HEADER =
  '"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"';

const RBC_ACCOUNTS = [
  { type: 'Chequing', number: '00000-1234567' },
  { type: 'Savings', number: '00000-7654321' },
] as const;

const RBC_DESCRIPTIONS: readonly (readonly [string, string])[] = [
  ['POS PURCHASE', 'SOBEYS #4567'],
  ['POS PURCHASE', 'SHOPPERS DRUG MART'],
  ['ONLINE BANKING PAYMENT', 'MB HYDRO'],
  ['CONTACTLESS INTERAC PURCHASE', 'TIM HORTONS #0871'],
  ['MONTHLY FEE', ''],
  ['ATM WITHDRAWAL', ''],
];

function rbcRows(): string[] {
  const rng = createRng(202614);
  const [chequing, savings] = RBC_ACCOUNTS;
  const row = (
    account: (typeof RBC_ACCOUNTS)[number],
    d: number,
    desc1: string,
    desc2: string,
    cents: number,
  ) => ({
    sortKey: isoDate(2026, 10, d),
    line: [
      account.type,
      account.number,
      mdyyyy(2026, 10, d),
      '',
      q(desc1),
      desc2 === '' ? '' : q(desc2),
      decimal(cents),
      '',
    ].join(','),
  });
  const rows: DatedRow[] = [
    // PLAN.md example rows, reproduced exactly.
    {
      sortKey: '2026-10-03',
      line: 'Chequing,00000-1234567,10/3/2026,,"PAYROLL DEPOSIT","NORTHWIND MFG",2100.00,',
    },
    { sortKey: '2026-10-05', line: 'Chequing,00000-1234567,10/5/2026,,"HYDRO BILL PMT",,-143.76,' },
    row(chequing, 17, 'PAYROLL DEPOSIT', 'NORTHWIND MFG', 210000),
    row(savings, 1, 'TRANSFER IN', 'FROM CHEQUING', 50000),
    row(savings, 31, 'INTEREST', '', 412),
    row(savings, 15, 'TRANSFER IN', 'FROM CHEQUING', 50000),
    row(chequing, 1, 'TRANSFER OUT', 'TO SAVINGS', -50000),
    row(chequing, 15, 'TRANSFER OUT', 'TO SAVINGS', -50000),
    ...Array.from({ length: 22 }, () => {
      const [desc1, desc2] = rng.pick(RBC_DESCRIPTIONS);
      return row(chequing, rng.int(1, 31), desc1, desc2, -rng.int(250, 12000));
    }),
  ];
  return sortRows(rows);
}

// ---- Malformed and wrong headers ----

function malformedRows(): string[] {
  return [
    '10/01/2026,OTHER,Interac - Purchase - SOBEYS 4567,Interac - Purchase - SOBEYS 4567 WINNIPEG  MB  CA,-42.10',
    // Bad date.
    '13/45/2026,OTHER,Interac - Purchase - DOLLARAMA 11,Interac - Purchase - DOLLARAMA 1102 WINNIPEG  MB  CA,-10.00',
    // Non-numeric amount.
    '10/03/2026,OTHER,Interac - Purchase - SHELL C1234,Interac - Purchase - SHELL C12345 WINNIPEG  MB  CA,abc',
    // Short row: three fields instead of five.
    '10/04/2026,OTHER,ABM Withdrawal',
    // Blank line.
    '',
    '10/06/2026,OTHER,Interac - Purchase - TIM HORTONS,Interac - Purchase - TIM HORTONS 0871 WINNIPEG  MB  CA,-4.35',
    '10/07/2026,OTHER,EFT Deposit from Northwind Mfg,EFT Deposit from Northwind Mfg,1850.00',
    '10/08/2026,OTHER,Interest Paid,Interest Paid,0.01',
  ];
}

const WRONG_HEADERS_HEADER = 'When,Payee,Spent,Received,Balance';

function wrongHeadersRows(): string[] {
  return [
    '2026-10-01,Corner Store,12.50,,987.50',
    '2026-10-02,Paycheque,,1850.00,2837.50',
    '2026-10-03,Bakery,6.25,,2831.25',
    '2026-10-04,Bookshop,24.99,,2806.26',
    '2026-10-05,Refund,,10.00,2816.26',
  ];
}

// ---- Assembly ----

/** The fixture files, by name, exactly as they are written to fixtures/csv. */
export function generateFixtures(): Record<string, string> {
  const september = tangerineChequingSeptemberRows();
  return {
    'tangerine-chequing-2026-09.csv': lines([TANGERINE_CHEQUING_HEADER, ...september]),
    // The last 10 rows of the September file plus 25 new rows.
    'tangerine-chequing-2026-10-overlap.csv': lines([
      TANGERINE_CHEQUING_HEADER,
      ...september.slice(-10),
      ...tangerineChequingOctoberRows(),
    ]),
    'tangerine-mastercard-2026-10.csv': lines([
      TANGERINE_MASTERCARD_HEADER,
      ...tangerineMastercardRows(),
    ]),
    'simplii-visa-2026-10.csv': lines([SIMPLII_HEADER, ...simpliiRows()]),
    // Starts with a UTF-8 byte order mark, as the real export does.
    'walmart-mastercard-2026-09.csv': `\uFEFF${lines([WALMART_HEADER, ...walmartRows()])}`,
    'rbc-chequing-2026-10.csv': lines([RBC_HEADER, ...rbcRows()]),
    'malformed.csv': lines([TANGERINE_CHEQUING_HEADER, ...malformedRows()]),
    'wrong-headers.csv': lines([WRONG_HEADERS_HEADER, ...wrongHeadersRows()]),
  };
}

export const CSV_FIXTURE_DIR = join(import.meta.dirname, 'csv');

function main(): void {
  mkdirSync(CSV_FIXTURE_DIR, { recursive: true });
  for (const [name, content] of Object.entries(generateFixtures())) {
    writeFileSync(join(CSV_FIXTURE_DIR, name), content, 'utf8');
    console.log(`wrote fixtures/csv/${name}`);
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) main();
