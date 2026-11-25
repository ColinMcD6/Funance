import type { TransactionListItem } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import { groupByMerchant, queueActionFor, rulePatternFor } from './queue';

function item(
  id: number,
  merchantKey: string,
  suggestedCategoryId: number | null,
): TransactionListItem {
  return {
    id,
    accountId: 1,
    importId: 1,
    ownerId: 1,
    categoryId: null,
    categorySource: null,
    ruleId: null,
    date: `2026-10-${String(id).padStart(2, '0')}`,
    postedDate: null,
    amountCents: -100,
    description: merchantKey,
    memo: null,
    merchantKey,
    bankCategory: null,
    externalId: null,
    dedupKey: `k${String(id)}`,
    occurrence: 1,
    notes: null,
    excluded: false,
    rawRow: {},
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    suggestedCategoryId,
  };
}

describe('groupByMerchant', () => {
  it('groups by merchant key in the order of each group’s oldest row', () => {
    const groups = groupByMerchant([
      item(1, 'SAFEWAY', 4),
      item(2, 'UBER', 9),
      item(3, 'SAFEWAY', 4),
      item(4, 'COSTCO', null),
    ]);
    expect(groups.map((g) => [g.merchantKey, g.items.map((t) => t.id)])).toEqual([
      ['SAFEWAY', [1, 3]],
      ['UBER', [2]],
      ['COSTCO', [4]],
    ]);
  });

  it('shares a suggestion only when every row has the same one', () => {
    const [same, mixed, none] = groupByMerchant([
      item(1, 'A', 4),
      item(2, 'A', 4),
      item(3, 'B', 4),
      item(4, 'B', 5),
      item(5, 'C', null),
      item(6, 'C', null),
    ]);
    expect(same?.sharedSuggestionId).toBe(4);
    expect(mixed?.sharedSuggestionId).toBeNull();
    expect(none?.sharedSuggestionId).toBeNull();
  });

  it('treats a missing suggestion like null', () => {
    const bare = item(1, 'A', null);
    delete bare.suggestedCategoryId;
    expect(groupByMerchant([bare, item(2, 'A', null)])[0]?.sharedSuggestionId).toBeNull();
  });
});

describe('rulePatternFor', () => {
  it.each([
    ['WAL-MART #3177 WINNIPEG MB', 'WAL-MART WINNIPEG MB', 'WAL-MART'],
    ['CANADIAN TIRE #0233 WINNIPEG MB', 'CANADIAN TIRE WINNIPEG', 'CANADIAN TIRE'],
    ['GREEN BEAN CAFE WINNIPEG MB', 'GREEN BEAN CAFE', 'GREEN BEAN CAFE'],
    ['Interac - Purchase - SHELL C12345', 'SHELL', 'SHELL'],
    ['Tim  Hortons   #12', 'TIM HORTONS', 'TIM HORTONS'],
    ['12345', '12345', '12345'],
  ])('%s with key %s gives %s', (description, key, expected) => {
    expect(rulePatternFor(description, key)).toBe(expected);
  });

  it('falls back to the description when no part of the key appears in it', () => {
    expect(rulePatternFor(' Odd text ', 'SOMETHING ELSE')).toBe('Odd text');
  });
});

describe('queueActionFor', () => {
  const press = (key: string, target: EventTarget | null = document.body, mods = {}) =>
    queueActionFor({ key, ctrlKey: false, altKey: false, metaKey: false, target, ...mods });

  it('maps the shortcut keys, in either case', () => {
    expect(
      ['j', 'ArrowDown', 'k', 'ArrowUp', 'a', 'A', 'Enter', 'g', 'c'].map((k) => press(k)),
    ).toEqual([
      'next',
      'next',
      'previous',
      'previous',
      'accept',
      'accept',
      'accept',
      'acceptGroup',
      'pickCategory',
    ]);
    expect(press('x')).toBeNull();
  });

  it('leaves keys typed into form controls, and modified presses, to the browser', () => {
    for (const tag of ['input', 'select', 'textarea']) {
      expect(press('j', document.createElement(tag))).toBeNull();
    }
    expect(press('j', document.body, { ctrlKey: true })).toBeNull();
    expect(press('a', document.body, { metaKey: true })).toBeNull();
    expect(press('c', document.body, { altKey: true })).toBeNull();
  });

  it('leaves Enter on a button or link alone, but handles other keys there', () => {
    const button = document.createElement('button');
    expect(press('Enter', button)).toBeNull();
    expect(press('Enter', document.createElement('a'))).toBeNull();
    expect(press('j', button)).toBe('next');
  });
});
