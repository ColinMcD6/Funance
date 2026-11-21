import type { Account, CsvPreset } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import {
  draftFromAccount,
  draftToRequest,
  emptyDraft,
  withPreset,
  type AccountDraft,
} from './account-draft';

// A copy of two presets from packages/core (the web app does not depend on core).
const walmart: CsvPreset = {
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
};

const simplii: CsvPreset = {
  id: 'simplii',
  label: 'Simplii Visa',
  institution: 'simplii',
  type: 'credit_card',
  mapping: {
    encoding: 'utf-8',
    hasHeader: true,
    columns: {
      date: 'Date',
      description: ['Transaction Details'],
      outflow: 'Funds Out',
      inflow: 'Funds In',
    },
    dateFormat: 'MM/dd/yyyy',
    amountSign: 'negative_is_outflow',
    bankCategoryRegex: 'Category: (.+)$',
    accountFilterValue: '4500',
    skipZeroAmount: true,
  },
};

function named(draft: AccountDraft): AccountDraft {
  return { ...draft, name: 'My card', defaultOwnerId: '3' };
}

function expectOk(draft: AccountDraft) {
  const result = draftToRequest(draft);
  if (!result.ok) throw new Error(result.errors.join('; '));
  return result.request;
}

function expectErrors(draft: AccountDraft): string[] {
  const result = draftToRequest(draft);
  if (result.ok) throw new Error('expected errors');
  return result.errors;
}

describe('withPreset and draftToRequest', () => {
  it.each([walmart, simplii])('round-trips the $id preset mapping unchanged', (preset) => {
    const request = expectOk(named(withPreset(emptyDraft(), preset)));
    expect(request.csvMapping).toEqual(preset.mapping);
    expect(request).toMatchObject({
      name: 'My card',
      institution: preset.institution,
      type: preset.type,
      defaultOwnerId: 3,
    });
  });

  it('keeps the name and default owner when a preset is applied', () => {
    const draft = withPreset(named(emptyDraft()), walmart);
    expect(draft.name).toBe('My card');
    expect(draft.defaultOwnerId).toBe('3');
  });

  it('does not share the preset objects with the draft', () => {
    const draft = withPreset(emptyDraft(), walmart);
    draft.skipWhen[0] = { column: 'X', notEquals: '', matches: '' };
    expect(walmart.mapping.skipWhen).toEqual([{ column: 'Status', notEquals: 'APPROVED' }]);
  });

  it('maps cardholder names to owners', () => {
    const draft = named(withPreset(emptyDraft(), walmart));
    draft.ownerHints = [
      { value: ' ALEX SAMPLE ', ownerId: '1' },
      { value: 'JAMIE SAMPLE', ownerId: '2' },
    ];
    expect(expectOk(draft).csvMapping.ownerHintMap).toEqual({
      'ALEX SAMPLE': 1,
      'JAMIE SAMPLE': 2,
    });
  });

  it('trims columns, splits description lines and drops empty optional fields', () => {
    const draft = named(emptyDraft());
    draft.dateColumn = ' Date ';
    draft.descriptionColumns = 'Description 1\n\n Description 2 \n';
    draft.columns.amount = 'CAD$';
    draft.columns.memo = '   ';
    const mapping = expectOk(draft).csvMapping;
    expect(mapping.columns).toEqual({
      date: 'Date',
      description: ['Description 1', 'Description 2'],
      amount: 'CAD$',
    });
    expect(mapping).not.toHaveProperty('ownerHintMap');
    expect(mapping).not.toHaveProperty('skipWhen');
    expect(mapping).not.toHaveProperty('accountFilterValue');
  });
});

describe('draftToRequest errors', () => {
  it('lists every missing required field in plain words', () => {
    expect(expectErrors(emptyDraft())).toEqual(
      expect.arrayContaining([
        'Enter a name',
        'Choose a default owner',
        'Enter the date column',
        'Enter at least one description column',
        'Map either an amount column, or both outflow and inflow',
      ]),
    );
  });

  it('rejects incomplete or repeated owner hints', () => {
    const draft = named(withPreset(emptyDraft(), walmart));
    draft.ownerHints = [
      { value: '', ownerId: '1' },
      { value: 'ALEX', ownerId: '' },
      { value: 'JAMIE', ownerId: '1' },
      { value: 'JAMIE', ownerId: '2' },
    ];
    expect(expectErrors(draft)).toEqual([
      'Every owner hint needs a value',
      'Choose an owner for "ALEX"',
      '"JAMIE" is listed twice in the owner hints',
    ]);
  });

  it('rejects a skip rule without a column and a bad regex', () => {
    const draft = named(withPreset(emptyDraft(), walmart));
    draft.skipWhen.push({ column: ' ', notEquals: 'x', matches: '' });
    draft.bankCategoryRegex = '(unclosed';
    expect(expectErrors(draft)).toEqual([
      'Every skip rule needs a column',
      'Bank category pattern is not a valid regular expression',
    ]);
  });
});

describe('draftFromAccount', () => {
  it('round-trips a stored account', () => {
    const account: Account = {
      id: 4,
      name: 'Walmart Mastercard',
      institution: 'walmart',
      type: 'credit_card',
      defaultOwnerId: 3,
      csvMapping: { ...walmart.mapping, ownerHintMap: { 'ALEX SAMPLE': 1 } },
      archived: false,
      createdAt: '2026-11-20T12:00:00.000Z',
    };
    expect(expectOk(draftFromAccount(account))).toEqual({
      name: account.name,
      institution: account.institution,
      type: account.type,
      defaultOwnerId: 3,
      csvMapping: account.csvMapping,
    });
  });
});
