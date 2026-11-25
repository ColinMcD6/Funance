import type { Category } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import {
  budgetableCategories,
  draftToBudgets,
  newDraftRow,
  rowsInEffect,
  sortDraft,
  toDraft,
  type DraftRow,
} from './budget-draft';

function category(id: number, kind: Category['kind'] = 'expense', archived = false): Category {
  return {
    id,
    name: `C${String(id)}`,
    kind,
    color: '#000000',
    sortOrder: id,
    archived,
    groupName: 'G',
  };
}

function draft(key: string, fields: Partial<DraftRow>): DraftRow {
  return { key, categoryId: 1, ownerId: null, effectiveFrom: '2026-01', amount: '10', ...fields };
}

describe('toDraft', () => {
  it('shows amounts in dollars with cents', () => {
    expect(
      toDraft([
        { id: 7, categoryId: 1, ownerId: 2, monthlyAmountCents: 65050, effectiveFrom: '2026-03' },
      ]),
    ).toEqual([
      { key: 'budget-7', categoryId: 1, ownerId: 2, effectiveFrom: '2026-03', amount: '650.50' },
    ]);
  });
});

describe('draftToBudgets', () => {
  it('turns dollars into cents', () => {
    expect(
      draftToBudgets([
        draft('a', { amount: '$1,200' }),
        draft('b', { amount: '0', ownerId: 2 }),
        draft('c', { amount: '12.5', effectiveFrom: '2026-02' }),
      ]),
    ).toEqual({
      ok: true,
      budgets: [
        { categoryId: 1, ownerId: null, monthlyAmountCents: 120000, effectiveFrom: '2026-01' },
        { categoryId: 1, ownerId: 2, monthlyAmountCents: 0, effectiveFrom: '2026-01' },
        { categoryId: 1, ownerId: null, monthlyAmountCents: 1250, effectiveFrom: '2026-02' },
      ],
    });
  });

  it.each([
    ['empty', ''],
    ['not a number', 'lots'],
    ['negative', '-5'],
    ['too many decimals', '1.234'],
  ])('rejects an amount that is %s', (_name, amount) => {
    expect(draftToBudgets([draft('a', {}), draft('b', { amount })])).toEqual({
      ok: false,
      key: 'b',
      message: 'Enter an amount of $0 or more.',
    });
  });

  it('rejects a missing month', () => {
    expect(draftToBudgets([draft('a', { effectiveFrom: '' })])).toMatchObject({
      ok: false,
      key: 'a',
    });
  });

  it('points at the second of two rows with the same category, owner and month', () => {
    expect(
      draftToBudgets([draft('a', {}), draft('b', { ownerId: 1 }), draft('c', { amount: '99' })]),
    ).toEqual({
      ok: false,
      key: 'c',
      message: 'Another budget has the same category, owner and start month.',
    });
  });
});

describe('rowsInEffect', () => {
  it('marks the latest row at or before the month for each category and owner', () => {
    const rows = [
      draft('old', { effectiveFrom: '2026-01' }),
      draft('current', { effectiveFrom: '2026-06' }),
      draft('future', { effectiveFrom: '2027-01' }),
      draft('colin', { ownerId: 1, effectiveFrom: '2025-01' }),
      draft('bad', { categoryId: 2, effectiveFrom: '' }),
    ];
    expect([...rowsInEffect(rows, '2026-11')].sort()).toEqual(['colin', 'current']);
  });
});

describe('sortDraft', () => {
  it('orders by category order, household first, then owner order, then month', () => {
    const categories = [category(3), category(1)];
    const rows = [
      draft('c1-emily', { ownerId: 2 }),
      draft('c1-late', { effectiveFrom: '2026-05' }),
      draft('c3', { categoryId: 3 }),
      draft('c1-colin', { ownerId: 1 }),
      draft('c1', {}),
    ];
    expect(sortDraft(rows, categories, [1, 2, 3]).map((r) => r.key)).toEqual([
      'c3',
      'c1',
      'c1-late',
      'c1-colin',
      'c1-emily',
    ]);
  });
});

describe('budgetableCategories and newDraftRow', () => {
  it('leaves out transfers and archived categories', () => {
    expect(
      budgetableCategories([
        category(1),
        category(2, 'transfer'),
        category(3, 'expense', true),
        category(4, 'savings'),
      ]).map((c) => c.id),
    ).toEqual([1, 4]);
  });

  it('starts a household row with no amount and a unique key', () => {
    const a = newDraftRow(4, '2026-11');
    const b = newDraftRow(4, '2026-11');
    expect(a).toMatchObject({ categoryId: 4, ownerId: null, effectiveFrom: '2026-11', amount: '' });
    expect(a.key).not.toBe(b.key);
  });
});
