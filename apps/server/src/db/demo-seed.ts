import { createHash } from 'node:crypto';
import type { CategorySource } from '@funance/shared';
import { count } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from './migrate.js';
import { accounts, budgets, categories, imports, owners, rules, transactions } from './schema.js';

// Synthetic data for UI work and report tests (`pnpm seed:demo`). Every value comes from a seeded
// pseudo-random generator and a fixed month range, so two runs produce identical databases.

/** The 14 months the demo data covers, YYYY-MM. */
export const DEMO_MONTHS: readonly string[] = Array.from({ length: 14 }, (_, i) => {
  const index = 2025 * 12 + 8 + i; // September 2025 is month index 8 of 2025
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
});

const DEFAULT_SEED = 20261118;

/** Share of discretionary rows (not transfers, income or fixed bills) left uncategorized. */
const UNCATEGORIZED_SHARE = 0.3;

/** mulberry32: a small, fast, seeded PRNG returning floats in [0, 1). */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Merchant = {
  description: string;
  merchantKey: string;
  category: string;
  /** Cents, inclusive range of the absolute amount. */
  min: number;
  max: number;
  /** Times per month: a fixed count, or a [min, max] range. */
  perMonth: number | [number, number];
  inflow?: boolean;
  /** Always categorized (income and fixed bills that a household would have set long ago). */
  alwaysCategorized?: boolean;
  /** Fixed day of month instead of a random one. */
  day?: number;
};

const CARD_PAYMENT = 'Card Payment';

const ACCOUNT_MERCHANTS: Record<string, Merchant[]> = {
  'Tangerine Chequing': [
    {
      description: 'EFT Deposit from Northwind Mfg',
      merchantKey: 'EFT DEPOSIT FROM',
      category: 'Income',
      min: 240000,
      max: 240000,
      perMonth: 1,
      inflow: true,
      alwaysCategorized: true,
      day: 1,
    },
    {
      description: 'EFT Deposit from Northwind Mfg',
      merchantKey: 'EFT DEPOSIT FROM',
      category: 'Income',
      min: 240000,
      max: 240000,
      perMonth: 1,
      inflow: true,
      alwaysCategorized: true,
      day: 15,
    },
    {
      description: 'Pre-Authorized Payment - MAPLE PROPERTY MGMT',
      merchantKey: 'PRE-AUTHORIZED PAYMENT -',
      category: 'Home',
      min: 165000,
      max: 165000,
      perMonth: 1,
      alwaysCategorized: true,
      day: 1,
    },
    {
      description: 'Pre-Authorized Payment - NORTHERN FIBRE INTERNET',
      merchantKey: 'PRE-AUTHORIZED PAYMENT -',
      category: 'Internet',
      min: 8500,
      max: 8500,
      perMonth: 1,
      alwaysCategorized: true,
      day: 12,
    },
    {
      description: 'Transfer to TFSA Investment Account',
      merchantKey: 'TRANSFER TO TFSA',
      category: 'Investing',
      min: 30000,
      max: 60000,
      perMonth: 1,
      alwaysCategorized: true,
      day: 20,
    },
    {
      description: 'Interac - Purchase - SHELL C12345 WINNIPEG MB',
      merchantKey: 'SHELL WINNIPEG MB',
      category: 'Gas',
      min: 4000,
      max: 8500,
      perMonth: [1, 3],
    },
    {
      description: 'Credit Card Payment - Tangerine Mastercard',
      merchantKey: 'CREDIT CARD PAYMENT',
      category: CARD_PAYMENT,
      min: 90000,
      max: 140000,
      perMonth: 1,
      day: 25,
    },
  ],
  'Tangerine Mastercard': [
    {
      description: 'COSTCO WHOLESALE W1234 WINNIPEG MB',
      merchantKey: 'COSTCO WHOLESALE WINNIPEG',
      category: 'Groceries',
      min: 9000,
      max: 32000,
      perMonth: [2, 4],
    },
    {
      description: 'GREEN BEAN CAFE WINNIPEG MB',
      merchantKey: 'GREEN BEAN CAFE',
      category: 'Coffee',
      min: 450,
      max: 1400,
      perMonth: [4, 9],
    },
    {
      description: 'LAKESIDE BISTRO WINNIPEG MB',
      merchantKey: 'LAKESIDE BISTRO WINNIPEG',
      category: 'Eating out',
      min: 2500,
      max: 11000,
      perMonth: [1, 4],
    },
    {
      description: 'CINEPLEX 7788 WINNIPEG MB',
      merchantKey: 'CINEPLEX WINNIPEG MB',
      category: 'Entertainment',
      min: 1800,
      max: 6000,
      perMonth: [0, 2],
    },
    {
      description: 'NORTHERN MOBILE WIRELESS',
      merchantKey: 'NORTHERN MOBILE WIRELESS',
      category: 'Phone',
      min: 6500,
      max: 6500,
      perMonth: 1,
      alwaysCategorized: true,
      day: 8,
    },
    {
      description: 'PAYMENT - THANK YOU',
      merchantKey: 'PAYMENT - THANK',
      category: CARD_PAYMENT,
      min: 90000,
      max: 140000,
      perMonth: 1,
      inflow: true,
      day: 26,
    },
  ],
  'Simplii Visa': [
    {
      description: 'AMZN Mktp CA*AB1CD2EF3 866-216-1072, ON',
      merchantKey: 'AMZN MKTP CA',
      category: 'Home',
      min: 1500,
      max: 12000,
      perMonth: [1, 4],
    },
    {
      description: 'LITTLE SPROUTS BABY SHOP WINNIPEG',
      merchantKey: 'LITTLE SPROUTS BABY',
      category: 'Baby',
      min: 2000,
      max: 9000,
      perMonth: [1, 3],
    },
    {
      description: 'PAWS AND CLAWS PET SUPPLY',
      merchantKey: 'PAWS AND CLAWS',
      category: 'Cat',
      min: 2500,
      max: 7000,
      perMonth: [0, 2],
    },
    {
      description: 'PRAIRIE BREWING CO',
      merchantKey: 'PRAIRIE BREWING CO',
      category: 'Alcohol',
      min: 1500,
      max: 5000,
      perMonth: [0, 2],
    },
    {
      description: 'PAYMENT THANK YOU/PAIEMEN T MERCI',
      merchantKey: 'PAYMENT THANK YOU/PAIEMEN',
      category: CARD_PAYMENT,
      min: 30000,
      max: 50000,
      perMonth: 1,
      inflow: true,
      day: 23,
    },
  ],
  'Walmart Mastercard': [
    {
      description: 'WAL-MART #1234 WINNIPEG MB',
      merchantKey: 'WAL-MART WINNIPEG MB',
      category: 'Groceries',
      min: 1500,
      max: 18000,
      perMonth: [2, 5],
    },
    {
      description: 'WAL-MART #1234 WINNIPEG MB',
      merchantKey: 'WAL-MART WINNIPEG MB',
      category: 'Clothing',
      min: 2000,
      max: 8000,
      perMonth: [0, 1],
    },
    {
      description: 'PURCHASE INTEREST',
      merchantKey: 'PURCHASE INTEREST',
      category: 'Debt Payments',
      min: 20,
      max: 900,
      perMonth: 1,
      alwaysCategorized: true,
      day: 2,
    },
    {
      description: 'PAYMENT - THANK YOU',
      merchantKey: 'PAYMENT - THANK',
      category: CARD_PAYMENT,
      min: 30000,
      max: 120000,
      perMonth: 1,
      inflow: true,
      day: 21,
    },
  ],
  RBC: [
    {
      description: 'PAYROLL DEPOSIT CONTOSO HEALTH',
      merchantKey: 'PAYROLL DEPOSIT CONTOSO',
      category: 'Income',
      min: 210000,
      max: 210000,
      perMonth: 2,
      inflow: true,
      alwaysCategorized: true,
    },
    {
      description: 'HYDRO BILL PMT',
      merchantKey: 'HYDRO BILL PMT',
      category: 'Home',
      min: 9000,
      max: 18000,
      perMonth: 1,
      alwaysCategorized: true,
      day: 5,
    },
    {
      description: 'PRAIRIE MUTUAL INSURANCE',
      merchantKey: 'PRAIRIE MUTUAL INSURANCE',
      category: 'Car Insurance',
      min: 14200,
      max: 14200,
      perMonth: 1,
      alwaysCategorized: true,
      day: 10,
    },
    {
      description: 'SHOPPERS DRUG MART #0421',
      merchantKey: 'SHOPPERS DRUG MART',
      category: 'Personal Care',
      min: 800,
      max: 6500,
      perMonth: [1, 3],
    },
    {
      description: 'RIVERSIDE PHYSIO CLINIC',
      merchantKey: 'RIVERSIDE PHYSIO CLINIC',
      category: 'Health',
      min: 6000,
      max: 9500,
      perMonth: [0, 1],
    },
    {
      description: 'COMMUNITY FOOD BANK DONATION',
      merchantKey: 'COMMUNITY FOOD BANK',
      category: 'Donation',
      min: 2500,
      max: 10000,
      perMonth: [0, 1],
    },
    {
      description: 'Credit Card Payment - Simplii Visa',
      merchantKey: 'CREDIT CARD PAYMENT',
      category: CARD_PAYMENT,
      min: 30000,
      max: 50000,
      perMonth: 1,
      day: 22,
    },
  ],
};

export type DemoSeedOptions = {
  /** Timestamp written to every created_at, committed_at and updated_at. */
  clock: Clock;
  seed?: number;
};

export type DemoSeedSummary = {
  imports: number;
  transactions: number;
  categorized: number;
  totalCents: number;
  budgets: number;
};

/**
 * Demo budgets (M9), so the dashboard shows over and under indicators: a household Groceries
 * budget raised part way through, a household Eating out budget, and per-owner Coffee budgets
 * with no household one (the All view adds them up).
 */
export const DEMO_BUDGETS: readonly {
  category: string;
  owner: string | null;
  monthlyAmountCents: number;
  effectiveFrom: string;
}[] = [
  { category: 'Groceries', owner: null, monthlyAmountCents: 60000, effectiveFrom: '2025-09' },
  { category: 'Groceries', owner: null, monthlyAmountCents: 70000, effectiveFrom: '2026-06' },
  { category: 'Eating out', owner: null, monthlyAmountCents: 15000, effectiveFrom: '2025-09' },
  { category: 'Coffee', owner: 'Colin', monthlyAmountCents: 3000, effectiveFrom: '2025-09' },
  { category: 'Coffee', owner: 'Emily', monthlyAmountCents: 3000, effectiveFrom: '2025-09' },
];

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** PLAN.md section 2: SHA-256 of `date | amount_cents | description uppercased, whitespace collapsed`. */
function dedupKey(date: string, amountCents: number, description: string): string {
  const normalized = description.toUpperCase().replace(/\s+/g, ' ').trim();
  return sha256(`${date}|${amountCents}|${normalized}`);
}

function formatAmount(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Fills a seeded database with 14 months of synthetic transactions across the five seeded
 * accounts, one committed import per account and month. Refuses to run when transactions exist.
 */
export function seedDemo(db: Db, options: DemoSeedOptions): DemoSeedSummary {
  const rng = createRng(options.seed ?? DEFAULT_SEED);
  const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
  const now = options.clock();

  return db.transaction((tx) => {
    const existing = tx.select({ n: count() }).from(transactions).get();
    if ((existing?.n ?? 0) > 0) {
      throw new Error('The database already has transactions; seed:demo needs an empty one.');
    }

    const categoryIds = new Map(
      tx
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .all()
        .map((c) => [c.name, c.id]),
    );
    const ruleRows = tx.select().from(rules).all();
    const accountRows = tx.select().from(accounts).orderBy(accounts.id).all();

    const summary: DemoSeedSummary = {
      imports: 0,
      transactions: 0,
      categorized: 0,
      totalCents: 0,
      budgets: 0,
    };

    for (const account of accountRows) {
      const merchants = ACCOUNT_MERCHANTS[account.name];
      if (merchants === undefined) continue;
      const slug = account.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const occurrences = new Map<string, number>();

      for (const month of DEMO_MONTHS) {
        type Row = { date: string; amountCents: number; merchant: Merchant };
        const rows: Row[] = [];
        for (const merchant of merchants) {
          const times =
            typeof merchant.perMonth === 'number'
              ? merchant.perMonth
              : int(merchant.perMonth[0], merchant.perMonth[1]);
          for (let i = 0; i < times; i++) {
            const day = merchant.day ?? int(1, 28);
            const abs = int(merchant.min, merchant.max);
            rows.push({
              date: `${month}-${String(day).padStart(2, '0')}`,
              amountCents: merchant.inflow === true ? abs : -abs,
              merchant,
            });
          }
        }
        rows.sort((a, b) => a.date.localeCompare(b.date));
        if (rows.length === 0) continue;

        const filename = `demo-${slug}-${month}.csv`;
        const importRow = tx
          .insert(imports)
          .values({
            accountId: account.id,
            filename,
            fileSha256: sha256(filename),
            rawCsv: '',
            status: 'committed',
            uploadedByOwnerId: account.defaultOwnerId,
            rowCount: rows.length,
            insertedCount: rows.length,
            duplicateCount: 0,
            skippedCount: 0,
            errorCount: 0,
            dateMin: rows[0]?.date ?? null,
            dateMax: rows[rows.length - 1]?.date ?? null,
            createdAt: now,
            committedAt: now,
            undoneAt: null,
            kind: 'csv',
          })
          .returning({ id: imports.id })
          .get();
        summary.imports++;

        for (const { date, amountCents, merchant } of rows) {
          const isTransfer = merchant.category === CARD_PAYMENT;
          const keep =
            isTransfer || merchant.alwaysCategorized === true || rng() >= UNCATEGORIZED_SHARE;
          let categoryId: number | null = null;
          let categorySource: CategorySource | null = null;
          let ruleId: number | null = null;
          if (keep) {
            categoryId = categoryIds.get(merchant.category) ?? null;
            if (categoryId === null) throw new Error(`Unknown category ${merchant.category}`);
            const rule = isTransfer
              ? ruleRows.find((r) =>
                  merchant.description.toUpperCase().includes(r.pattern.toUpperCase()),
                )
              : undefined;
            categorySource = rule === undefined ? 'manual' : 'rule';
            ruleId = rule?.id ?? null;
          }

          const key = dedupKey(date, amountCents, merchant.description);
          const occurrence = (occurrences.get(key) ?? 0) + 1;
          occurrences.set(key, occurrence);

          tx.insert(transactions)
            .values({
              accountId: account.id,
              importId: importRow.id,
              ownerId: account.defaultOwnerId,
              categoryId,
              categorySource,
              ruleId,
              date,
              postedDate: null,
              amountCents,
              description: merchant.description,
              memo: null,
              merchantKey: merchant.merchantKey,
              bankCategory: null,
              externalId: null,
              dedupKey: key,
              occurrence,
              notes: null,
              excluded: false,
              rawRow: {
                Date: date,
                Description: merchant.description,
                Amount: formatAmount(amountCents),
              },
              createdAt: now,
              updatedAt: now,
            })
            .run();
          summary.transactions++;
          if (categoryId !== null) summary.categorized++;
          summary.totalCents += amountCents;
        }
      }
    }

    const ownerIds = new Map(
      tx
        .select({ id: owners.id, name: owners.name })
        .from(owners)
        .all()
        .map((o) => [o.name, o.id]),
    );
    for (const budget of DEMO_BUDGETS) {
      const categoryId = categoryIds.get(budget.category);
      if (categoryId === undefined) throw new Error(`Unknown category ${budget.category}`);
      let ownerId: number | null = null;
      if (budget.owner !== null) {
        ownerId = ownerIds.get(budget.owner) ?? null;
        if (ownerId === null) throw new Error(`Unknown owner ${budget.owner}`);
      }
      tx.insert(budgets)
        .values({
          categoryId,
          ownerId,
          monthlyAmountCents: budget.monthlyAmountCents,
          effectiveFrom: budget.effectiveFrom,
        })
        .run();
      summary.budgets++;
    }
    return summary;
  });
}
