import type { Rule } from '@funance/shared';
import { describe, expect, it } from 'vitest';
import {
  EMPTY_DRAFT,
  describeCondition,
  describeLimits,
  draftFromRule,
  draftToInput,
  nextPriority,
} from './rule-draft';

const RULE: Rule = {
  id: 7,
  priority: 40,
  matchField: 'bank_category',
  matchType: 'regex',
  pattern: '^groc',
  accountId: 2,
  direction: 'outflow',
  setCategoryId: 5,
  setOwnerId: 3,
  enabled: false,
  createdAt: '2026-11-20T12:00:00.000Z',
};

const LOOKUPS = {
  categories: [],
  accounts: [{ id: 2, name: 'Simplii Visa' }],
  owners: [{ id: 3, name: 'Joint' }],
} as unknown as Parameters<typeof describeLimits>[1];

describe('rule drafts', () => {
  it('round-trips a rule through a draft', () => {
    const fields = { ...RULE } as Partial<Rule>;
    delete fields.id;
    delete fields.createdAt;
    expect(draftToInput(draftFromRule(RULE), 40)).toEqual(fields);
  });

  it('turns empty selects into nulls', () => {
    expect(draftToInput({ ...EMPTY_DRAFT, pattern: 'x', setCategoryId: '4' }, 10)).toEqual({
      priority: 10,
      matchField: 'description',
      matchType: 'contains',
      pattern: 'x',
      setCategoryId: 4,
      accountId: null,
      direction: null,
      setOwnerId: null,
      enabled: true,
    });
  });

  it('needs a pattern, and a category unless a fallback is given for previews', () => {
    expect(draftToInput({ ...EMPTY_DRAFT, setCategoryId: '4' }, 10)).toBeNull();
    expect(draftToInput({ ...EMPTY_DRAFT, pattern: 'x' }, 10)).toBeNull();
    expect(draftToInput({ ...EMPTY_DRAFT, pattern: 'x' }, 10, 9)?.setCategoryId).toBe(9);
    expect(draftToInput({ ...EMPTY_DRAFT, pattern: 'x', setCategoryId: '4' }, 10, 9)).toMatchObject(
      { setCategoryId: 4 },
    );
  });

  it('puts a new rule after the last one', () => {
    expect(nextPriority([])).toBe(10);
    expect(nextPriority([RULE, { ...RULE, priority: 5 }])).toBe(50);
  });

  it('describes the condition and limits', () => {
    expect(describeCondition(RULE)).toBe('Bank category matches regex “^groc”');
    expect(describeLimits(RULE, LOOKUPS)).toEqual([
      'Only Simplii Visa',
      'Outflows only',
      'Sets owner Joint',
    ]);
    expect(
      describeLimits({ ...RULE, accountId: null, direction: 'inflow', setOwnerId: null }, LOOKUPS),
    ).toEqual(['Inflows only']);
  });
});
