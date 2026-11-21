import type { CategoryKind, CsvPresetId, Institution, AccountType } from '@funance/shared';

// Default rows written to an empty database (PLAN.md section 2). Edited later in Settings.

export const SEED_OWNERS = [
  { name: 'Colin', kind: 'person', sortOrder: 1 },
  { name: 'Emily', kind: 'person', sortOrder: 2 },
  { name: 'Joint', kind: 'joint', sortOrder: 3 },
] as const;

export type SeedOwnerName = (typeof SEED_OWNERS)[number]['name'];

type SeedCategory = { name: string; groupName: string; kind: CategoryKind; color: string };

/**
 * The 26 categories of the legacy sheet's Categories tab, in its major-category order, plus the
 * two transfer categories that keep card payments out of totals.
 */
export const SEED_CATEGORIES: readonly SeedCategory[] = [
  { name: 'Clothing', groupName: 'Clothing', kind: 'expense', color: '#8b5cf6' },
  { name: 'Donation', groupName: 'Giving', kind: 'expense', color: '#ec4899' },
  { name: 'Gifts', groupName: 'Giving', kind: 'expense', color: '#f472b6' },
  { name: 'Groceries', groupName: 'Groceries', kind: 'expense', color: '#16a34a' },
  { name: 'Home', groupName: 'Housing', kind: 'expense', color: '#0f766e' },
  { name: 'Coffee', groupName: 'Joy', kind: 'expense', color: '#92400e' },
  { name: 'Eating out', groupName: 'Joy', kind: 'expense', color: '#ea580c' },
  { name: 'Entertainment', groupName: 'Joy', kind: 'expense', color: '#f59e0b' },
  { name: 'Hobbies', groupName: 'Joy', kind: 'expense', color: '#eab308' },
  { name: 'Alcohol', groupName: 'Joy', kind: 'expense', color: '#b45309' },
  { name: 'Baby', groupName: 'Kid', kind: 'expense', color: '#38bdf8' },
  { name: 'Investing', groupName: 'Money', kind: 'savings', color: '#059669' },
  { name: 'Debt Payments', groupName: 'Money', kind: 'expense', color: '#dc2626' },
  { name: 'Income', groupName: 'Money', kind: 'income', color: '#22c55e' },
  { name: 'Cat', groupName: 'Pet', kind: 'expense', color: '#a855f7' },
  { name: 'Gas', groupName: 'Transportation', kind: 'expense', color: '#475569' },
  { name: 'Car Insurance', groupName: 'Transportation', kind: 'expense', color: '#64748b' },
  {
    name: 'Transportation (Other)',
    groupName: 'Transportation',
    kind: 'expense',
    color: '#94a3b8',
  },
  { name: 'Car Maintenance', groupName: 'Transportation', kind: 'expense', color: '#334155' },
  { name: 'Travel', groupName: 'Travel', kind: 'expense', color: '#2563eb' },
  { name: 'Internet', groupName: 'Utilities', kind: 'expense', color: '#0891b2' },
  { name: 'Phone', groupName: 'Utilities', kind: 'expense', color: '#06b6d4' },
  { name: 'Vacation', groupName: 'Vacation', kind: 'expense', color: '#4f46e5' },
  { name: 'Health', groupName: 'Wellbeing', kind: 'expense', color: '#e11d48' },
  { name: 'Personal Care', groupName: 'Wellbeing', kind: 'expense', color: '#fb7185' },
  { name: 'Education', groupName: 'Education', kind: 'expense', color: '#7c3aed' },
  { name: 'Card Payment', groupName: 'Transfers', kind: 'transfer', color: '#9ca3af' },
  { name: 'Transfer', groupName: 'Transfers', kind: 'transfer', color: '#d1d5db' },
];

type SeedAccount = {
  name: string;
  institution: Institution;
  type: AccountType;
  preset: CsvPresetId;
  defaultOwner: SeedOwnerName;
};

export const SEED_ACCOUNTS: readonly SeedAccount[] = [
  {
    name: 'Tangerine Chequing',
    institution: 'tangerine',
    type: 'chequing',
    preset: 'tangerine-chequing',
    defaultOwner: 'Colin',
  },
  {
    name: 'Tangerine Mastercard',
    institution: 'tangerine',
    type: 'credit_card',
    preset: 'tangerine-mastercard',
    defaultOwner: 'Colin',
  },
  {
    name: 'Simplii Visa',
    institution: 'simplii',
    type: 'credit_card',
    preset: 'simplii',
    defaultOwner: 'Joint',
  },
  {
    name: 'Walmart Mastercard',
    institution: 'walmart',
    type: 'credit_card',
    preset: 'walmart-mastercard',
    defaultOwner: 'Joint',
  },
  // RBC's account type is unconfirmed (PLAN.md section 8); chequing is assumed.
  { name: 'RBC', institution: 'rbc', type: 'chequing', preset: 'rbc', defaultOwner: 'Emily' },
];

/** Descriptions that mark a credit card payment; each becomes a rule setting Card Payment. */
export const SEED_CARD_PAYMENT_PATTERNS = [
  'PAYMENT - THANK YOU',
  'PAYMENT THANK YOU',
  'Credit Card Payment',
] as const;
