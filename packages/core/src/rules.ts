import type { Rule, RuleMatchField, RuleMatchType } from '@funance/shared';

/** The fields of a transaction that rules can match on (PLAN.md section 2, "rules"). */
export type RuleTarget = {
  accountId: number | null;
  description: string;
  memo: string | null;
  bankCategory: string | null;
  amountCents: number;
};

/** The parts of a rule the matcher reads. Saved rules and unsaved drafts both fit. */
export type MatchableRule = Pick<
  Rule,
  'priority' | 'matchField' | 'matchType' | 'pattern' | 'accountId' | 'direction' | 'enabled'
> & { id?: number };

/**
 * Why a pattern cannot be saved, or null when it can. Only a regex can be invalid: it must
 * compile, case-insensitively, as a JavaScript regular expression.
 */
export function rulePatternError(matchType: RuleMatchType, pattern: string): string | null {
  if (pattern.length === 0) return 'Pattern must not be empty';
  if (matchType !== 'regex') return null;
  try {
    new RegExp(pattern, 'i');
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Invalid regular expression';
  }
}

type TextTest = (value: string) => boolean;

/** A case-insensitive test for one rule's pattern, or null when the pattern cannot match. */
function textTest(matchType: RuleMatchType, pattern: string): TextTest | null {
  if (rulePatternError(matchType, pattern) !== null) return null;
  const needle = pattern.toLowerCase();
  switch (matchType) {
    case 'contains':
      return (value) => value.toLowerCase().includes(needle);
    case 'starts_with':
      return (value) => value.toLowerCase().startsWith(needle);
    case 'equals':
      return (value) => value.toLowerCase() === needle;
    case 'regex': {
      const re = new RegExp(pattern, 'i');
      return (value) => re.test(value);
    }
  }
}

function fieldValue(target: RuleTarget, field: RuleMatchField): string | null {
  switch (field) {
    case 'description':
      return target.description;
    case 'memo':
      return target.memo;
    case 'bank_category':
      return target.bankCategory;
  }
}

/** Lower priority first; equal priorities fall back to id (unsaved rules last). */
function byPriority(a: MatchableRule, b: MatchableRule): number {
  return (
    a.priority - b.priority || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
  );
}

/** True when `rule` matches `target`, ignoring its `enabled` flag. Never throws. */
function conditionsHold(rule: MatchableRule, test: TextTest | null, target: RuleTarget): boolean {
  if (test === null) return false;
  if (rule.accountId !== null && rule.accountId !== target.accountId) return false;
  if (rule.direction === 'outflow' && !(target.amountCents < 0)) return false;
  if (rule.direction === 'inflow' && !(target.amountCents > 0)) return false;
  const value = fieldValue(target, rule.matchField);
  return value !== null && test(value);
}

/**
 * Compiles `rules` once and returns a function giving the first enabled rule, by priority, that
 * matches a target, or null. Text matching is case-insensitive; a rule limited to an account
 * matches only that account's rows; `outflow` needs a negative amount and `inflow` a positive
 * one; a null field never matches. A rule whose pattern is invalid never matches, so matching
 * never throws (invalid patterns are rejected when a rule is saved).
 */
export function createRuleMatcher<R extends MatchableRule>(
  rules: readonly R[],
): (target: RuleTarget) => R | null {
  const compiled = rules
    .filter((rule) => rule.enabled)
    .sort(byPriority)
    .map((rule) => ({ rule, test: textTest(rule.matchType, rule.pattern) }));
  return (target) =>
    compiled.find(({ rule, test }) => conditionsHold(rule, test, target))?.rule ?? null;
}

/** The first enabled rule, by priority, that matches `target`, or null. */
export function matchRule<R extends MatchableRule>(
  target: RuleTarget,
  rules: readonly R[],
): R | null {
  return createRuleMatcher(rules)(target);
}

/** True when `rule` matches `target`, whether or not it is enabled. For previews of a draft. */
export function ruleMatches(rule: MatchableRule, target: RuleTarget): boolean {
  return conditionsHold(rule, textTest(rule.matchType, rule.pattern), target);
}
