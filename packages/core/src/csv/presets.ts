import type { CsvPreset, CsvPresetId } from '@funance/shared';

/**
 * Preset CSV mappings, one per supported bank export (PLAN.md section 2, "CSV mapping").
 * An account copies a preset's mapping at creation and may then edit it.
 */
export const csvPresets: readonly CsvPreset[] = [
  {
    id: 'tangerine-chequing',
    label: 'Tangerine chequing',
    institution: 'tangerine',
    type: 'chequing',
    mapping: {
      encoding: 'utf-8',
      hasHeader: true,
      // The Name column is truncated, so the description comes from Memo.
      columns: { date: 'Date', description: ['Memo'], amount: 'Amount' },
      dateFormat: 'MM/dd/yyyy',
      amountSign: 'negative_is_outflow',
      // Drops the zero-amount "Posted :" marker lines.
      skipZeroAmount: true,
    },
  },
  {
    id: 'tangerine-mastercard',
    label: 'Tangerine Mastercard',
    institution: 'tangerine',
    type: 'credit_card',
    mapping: {
      encoding: 'utf-8',
      hasHeader: true,
      columns: {
        date: 'Transaction date',
        description: ['Name'],
        memo: 'Memo',
        amount: 'Amount',
        bankCategory: 'Memo',
      },
      dateFormat: 'MM/dd/yyyy',
      amountSign: 'negative_is_outflow',
      bankCategoryRegex: 'Category: (.+)$',
      skipZeroAmount: false,
    },
  },
  {
    id: 'simplii',
    label: 'Simplii Visa',
    institution: 'simplii',
    type: 'credit_card',
    mapping: {
      encoding: 'utf-8',
      // The header names carry stray spaces; they are trimmed before matching.
      hasHeader: true,
      columns: {
        date: 'Date',
        description: ['Transaction Details'],
        outflow: 'Funds Out',
        inflow: 'Funds In',
      },
      dateFormat: 'MM/dd/yyyy',
      amountSign: 'negative_is_outflow',
      skipZeroAmount: false,
    },
  },
  {
    id: 'walmart-mastercard',
    label: 'Walmart Mastercard',
    institution: 'walmart',
    type: 'credit_card',
    mapping: {
      encoding: 'utf-8',
      hasHeader: true,
      columns: {
        date: 'Date',
        postedDate: 'Posted Date',
        description: ['Merchant Name'],
        amount: 'Amount',
        externalId: 'Reference Number',
        bankCategory: 'Merchant Category',
        ownerHint: 'Name on Card',
      },
      dateFormat: 'yyyy-MM-dd',
      amountSign: 'positive_is_outflow',
      ownerHintMap: {},
      skipZeroAmount: false,
      skipWhen: [{ column: 'Status', notEquals: 'APPROVED' }],
    },
  },
  {
    id: 'rbc',
    label: 'RBC (unverified layout)',
    institution: 'rbc',
    type: 'chequing',
    mapping: {
      encoding: 'utf-8',
      hasHeader: true,
      columns: {
        date: 'Transaction Date',
        description: ['Description 1', 'Description 2'],
        amount: 'CAD$',
        accountFilter: 'Account Number',
      },
      dateFormat: 'M/d/yyyy',
      amountSign: 'negative_is_outflow',
      skipZeroAmount: false,
    },
  },
];

/** The preset with this id. Every `CsvPresetId` has one. */
export function getCsvPreset(id: CsvPresetId): CsvPreset {
  const preset = csvPresets.find((p) => p.id === id);
  if (preset === undefined) throw new Error(`Unknown CSV preset: ${id}`);
  return preset;
}
