import { createRuleMatcher, type RuleTarget } from '@funance/core';
import type { Rule } from '@funance/shared';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../db/migrate.js';
import { categories, rules } from '../db/schema.js';

/** A database, or the transaction an import commit runs in. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** The fields of an imported row that rules can match on (PLAN.md section 2, "rules"). */
export type RuleCandidate = RuleTarget;

/** What a matching rule sets on a row. */
export type RuleAssignment = {
  categoryId: number;
  ruleId: number;
  /** The rule's `set_owner_id`; null keeps the row's owner. */
  ownerId: number | null;
};

/**
 * Categorizes rows during an import preview and commit. Returns one entry per candidate, in
 * order: the first matching rule's assignment, or null when no rule matches.
 *
 * `databaseRuleEngine` is the real one and the app's default; tests may pass another.
 */
export type RuleEngine = (
  db: DbOrTx,
  candidates: readonly RuleCandidate[],
) => (RuleAssignment | null)[];

/** Matches nothing. For tests that want imported rows left uncategorized. */
export const noopRuleEngine: RuleEngine = (_db, candidates) => candidates.map(() => null);

/**
 * The rules that may categorize rows: enabled, and setting a category that is not archived
 * (archived categories cannot be newly assigned).
 */
export function activeRules(db: DbOrTx): Rule[] {
  return db
    .select({ rule: rules })
    .from(rules)
    .innerJoin(categories, eq(rules.setCategoryId, categories.id))
    .where(and(eq(rules.enabled, true), eq(categories.archived, false)))
    .all()
    .map((row) => row.rule);
}

/** What `rule` sets on a row it matches. */
export function assignmentOf(rule: Rule): RuleAssignment {
  return { categoryId: rule.setCategoryId, ruleId: rule.id, ownerId: rule.setOwnerId };
}

/** Matches candidates against the database's active rules: by priority, first match wins. */
export const databaseRuleEngine: RuleEngine = (db, candidates) => {
  const match = createRuleMatcher(activeRules(db));
  return candidates.map((candidate) => {
    const rule = match(candidate);
    return rule === null ? null : assignmentOf(rule);
  });
};
