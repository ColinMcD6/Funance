import type {
  Account,
  Category,
  Direction,
  Owner,
  Rule,
  RuleInput,
  RuleMatchField,
  RuleMatchType,
} from '@funance/shared';

/** The rule form's state; selects hold strings, '' meaning none. */
export type RuleDraft = {
  matchField: RuleMatchField;
  matchType: RuleMatchType;
  pattern: string;
  setCategoryId: string;
  accountId: string;
  direction: '' | Direction;
  setOwnerId: string;
  enabled: boolean;
};

export const EMPTY_DRAFT: RuleDraft = {
  matchField: 'description',
  matchType: 'contains',
  pattern: '',
  setCategoryId: '',
  accountId: '',
  direction: '',
  setOwnerId: '',
  enabled: true,
};

export const FIELD_LABELS: Record<RuleMatchField, string> = {
  description: 'Description',
  memo: 'Memo',
  bank_category: 'Bank category',
};

export const TYPE_LABELS: Record<RuleMatchType, string> = {
  contains: 'contains',
  starts_with: 'starts with',
  equals: 'equals',
  regex: 'matches regex',
};

export function draftFromRule(rule: Rule): RuleDraft {
  return {
    matchField: rule.matchField,
    matchType: rule.matchType,
    pattern: rule.pattern,
    setCategoryId: String(rule.setCategoryId),
    accountId: rule.accountId === null ? '' : String(rule.accountId),
    direction: rule.direction ?? '',
    setOwnerId: rule.setOwnerId === null ? '' : String(rule.setOwnerId),
    enabled: rule.enabled,
  };
}

const idOrNull = (value: string): number | null => (value === '' ? null : Number(value));

/**
 * The request body for a draft, or null while it cannot be saved (no pattern or no category).
 * Without a `categoryFallback`, a category is required; with one, a draft with no category yet
 * still gives a body, which is enough to preview its matches.
 */
export function draftToInput(
  draft: RuleDraft,
  priority: number,
  categoryFallback?: number,
): RuleInput | null {
  const setCategoryId = idOrNull(draft.setCategoryId) ?? categoryFallback ?? null;
  if (draft.pattern === '' || setCategoryId === null) return null;
  return {
    priority,
    matchField: draft.matchField,
    matchType: draft.matchType,
    pattern: draft.pattern,
    setCategoryId,
    accountId: idOrNull(draft.accountId),
    direction: draft.direction === '' ? null : draft.direction,
    setOwnerId: idOrNull(draft.setOwnerId),
    enabled: draft.enabled,
  };
}

/** Priority for a new rule: after every existing one, in steps of ten. */
export function nextPriority(rules: readonly Rule[]): number {
  return rules.reduce((max, rule) => Math.max(max, rule.priority), 0) + 10;
}

export type RuleLookups = {
  categories: readonly Category[];
  accounts: readonly Account[];
  owners: readonly Owner[];
};

/** "Description contains “COSTCO”" */
export function describeCondition(rule: Pick<Rule, 'matchField' | 'matchType' | 'pattern'>) {
  return `${FIELD_LABELS[rule.matchField]} ${TYPE_LABELS[rule.matchType]} “${rule.pattern}”`;
}

/** The limits and side effects of a rule, e.g. "Only Simplii Visa · Outflows only". */
export function describeLimits(rule: Rule, lookups: RuleLookups): string[] {
  const parts: string[] = [];
  if (rule.accountId !== null) {
    const name = lookups.accounts.find((a) => a.id === rule.accountId)?.name;
    parts.push(`Only ${name ?? `account ${rule.accountId}`}`);
  }
  if (rule.direction === 'outflow') parts.push('Outflows only');
  if (rule.direction === 'inflow') parts.push('Inflows only');
  if (rule.setOwnerId !== null) {
    const name = lookups.owners.find((o) => o.id === rule.setOwnerId)?.name;
    parts.push(`Sets owner ${name ?? rule.setOwnerId}`);
  }
  return parts;
}

export function categoryName(lookups: RuleLookups, id: number): string {
  return lookups.categories.find((c) => c.id === id)?.name ?? `Category ${id}`;
}
