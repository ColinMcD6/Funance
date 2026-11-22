import { describe, expect, it } from 'vitest';
import {
  createRuleMatcher,
  matchRule,
  ruleMatches,
  rulePatternError,
  type MatchableRule,
  type RuleTarget,
} from './rules.js';

function target(overrides: Partial<RuleTarget> = {}): RuleTarget {
  return {
    accountId: 1,
    description: 'COSTCO WHOLESALE W1234 WINNIPEG MB',
    memo: 'Rewards earned: 1.02 ~ Category: Groceries',
    bankCategory: 'Groceries',
    amountCents: -20411,
    ...overrides,
  };
}

let nextId = 1;
function rule(overrides: Partial<MatchableRule> = {}): MatchableRule & { id: number } {
  return {
    id: nextId++,
    priority: 10,
    matchField: 'description',
    matchType: 'contains',
    pattern: 'costco',
    accountId: null,
    direction: null,
    enabled: true,
    ...overrides,
  };
}

describe('match types', () => {
  it.each([
    ['contains', 'wholesale', true],
    ['contains', 'safeway', false],
    ['starts_with', 'costco w', true],
    ['starts_with', 'wholesale', false],
    ['equals', 'costco wholesale w1234 winnipeg mb', true],
    ['equals', 'costco wholesale', false],
    ['regex', '^costco\\s+wholesale\\b', true],
    ['regex', 'W\\d{4} WINNIPEG', true],
    ['regex', '^wholesale', false],
  ] as const)('%s %j matches: %s', (matchType, pattern, expected) => {
    const r = rule({ matchType, pattern });
    expect(matchRule(target(), [r])).toBe(expected ? r : null);
  });

  it.each(['contains', 'starts_with', 'equals', 'regex'] as const)(
    '%s ignores case in both pattern and value',
    (matchType) => {
      const pattern = matchType === 'regex' ? 'CoStCo' : 'CoStCo WhOlEsAlE w1234 WiNnIpEg Mb';
      const r = rule({ matchType, pattern });
      expect(matchRule(target({ description: 'costco WHOLESALE W1234 winnipeg MB' }), [r])).toBe(r);
    },
  );

  it('treats contains, starts_with and equals patterns literally, not as regex', () => {
    const r = rule({ pattern: 'AMZN Mktp CA*' });
    expect(matchRule(target({ description: 'AMZN MKTP CA*AB1CD2EF3' }), [r])).toBe(r);
    expect(matchRule(target({ description: 'AMZN MKTP CAX' }), [r])).toBeNull();
  });
});

describe('match fields', () => {
  it('matches memo and bank_category', () => {
    const memo = rule({ matchField: 'memo', pattern: 'category: groceries' });
    const bank = rule({ matchField: 'bank_category', matchType: 'equals', pattern: 'groceries' });
    expect(matchRule(target(), [memo])).toBe(memo);
    expect(matchRule(target(), [bank])).toBe(bank);
    expect(matchRule(target({ description: 'nothing', bankCategory: 'Gas' }), [bank])).toBeNull();
  });

  it('never matches a null field, even with a regex that accepts empty text', () => {
    const memo = rule({ matchField: 'memo', matchType: 'regex', pattern: '^$' });
    const bank = rule({ matchField: 'bank_category', matchType: 'regex', pattern: '.*' });
    expect(matchRule(target({ memo: null, bankCategory: null }), [memo, bank])).toBeNull();
  });
});

describe('account and direction limits', () => {
  it('a rule limited to an account matches only that account', () => {
    const r = rule({ accountId: 2 });
    expect(matchRule(target({ accountId: 2 }), [r])).toBe(r);
    expect(matchRule(target({ accountId: 1 }), [r])).toBeNull();
    expect(matchRule(target({ accountId: null }), [r])).toBeNull();
  });

  it('a rule with no account matches every account, and rows with none', () => {
    const r = rule();
    expect(matchRule(target({ accountId: 5 }), [r])).toBe(r);
    expect(matchRule(target({ accountId: null }), [r])).toBe(r);
  });

  it('outflow needs a negative amount, inflow a positive one, null takes both', () => {
    const out = rule({ direction: 'outflow' });
    const inn = rule({ direction: 'inflow' });
    const both = rule({ direction: null });
    expect(matchRule(target({ amountCents: -1 }), [out])).toBe(out);
    expect(matchRule(target({ amountCents: 1 }), [out])).toBeNull();
    expect(matchRule(target({ amountCents: 1 }), [inn])).toBe(inn);
    expect(matchRule(target({ amountCents: -1 }), [inn])).toBeNull();
    expect(matchRule(target({ amountCents: 0 }), [out, inn])).toBeNull();
    expect(matchRule(target({ amountCents: 1 }), [both])).toBe(both);
    expect(matchRule(target({ amountCents: -1 }), [both])).toBe(both);
  });
});

describe('priority and enabled', () => {
  it('the lowest priority that matches wins, whatever the input order', () => {
    const late = rule({ priority: 30, pattern: 'costco' });
    const early = rule({ priority: 5, pattern: 'wholesale' });
    const miss = rule({ priority: 1, pattern: 'safeway' });
    expect(matchRule(target(), [late, miss, early])).toBe(early);
    expect(matchRule(target(), [early, late, miss])).toBe(early);
  });

  it('equal priorities fall back to the lower id', () => {
    const second = rule({ id: 9, priority: 10 });
    const first = rule({ id: 3, priority: 10 });
    expect(matchRule(target(), [second, first])).toBe(first);
  });

  it('skips disabled rules and falls through to the next match', () => {
    const disabled = rule({ priority: 1, enabled: false });
    const next = rule({ priority: 2 });
    expect(matchRule(target(), [disabled, next])).toBe(next);
    expect(matchRule(target(), [disabled])).toBeNull();
  });

  it('returns null with no rules', () => {
    expect(matchRule(target(), [])).toBeNull();
  });

  it('does not reorder the caller’s array', () => {
    const a = rule({ priority: 20 });
    const b = rule({ priority: 10 });
    const list = [a, b];
    createRuleMatcher(list);
    expect(list).toEqual([a, b]);
  });
});

describe('invalid regex', () => {
  it('rulePatternError explains an invalid regex and accepts valid patterns', () => {
    expect(rulePatternError('regex', '(unclosed')).toMatch(/.+/);
    expect(rulePatternError('regex', '[a-')).toMatch(/.+/);
    expect(rulePatternError('regex', '^costco\\b')).toBeNull();
    expect(rulePatternError('contains', '(unclosed')).toBeNull();
    expect(rulePatternError('equals', '')).toMatch(/empty/);
  });

  it('a rule with an invalid regex never matches and never throws', () => {
    const bad = rule({ priority: 1, matchType: 'regex', pattern: '(unclosed' });
    const good = rule({ priority: 2 });
    expect(() => matchRule(target(), [bad])).not.toThrow();
    expect(matchRule(target(), [bad])).toBeNull();
    expect(matchRule(target(), [bad, good])).toBe(good);
    expect(ruleMatches(bad, target())).toBe(false);
  });
});

describe('ruleMatches', () => {
  it('tests one rule regardless of its enabled flag', () => {
    expect(ruleMatches(rule({ enabled: false }), target())).toBe(true);
    expect(ruleMatches(rule({ pattern: 'safeway' }), target())).toBe(false);
  });
});
