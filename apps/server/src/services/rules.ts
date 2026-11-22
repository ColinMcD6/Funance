import { createRuleMatcher, ruleMatches, rulePatternError } from '@funance/core';
import type {
  Rule,
  RuleMatchType,
  TestRuleResponse,
  Transaction,
  UpdateRuleRequest,
} from '@funance/shared';
import { ruleInputSchema } from '@funance/shared';
import { asc, desc, eq, inArray, isNull, or } from 'drizzle-orm';
import type { z } from 'zod';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { accounts, categories, owners, rules, transactions } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';
import { activeRules } from './rule-engine.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** A rule's editable fields with defaults filled in (the parsed body of POST /rules). */
export type RuleFields = z.output<typeof ruleInputSchema>;

/** How many matching transactions POST /rules/test returns as samples. */
const SAMPLE_SIZE = 10;
/** Rows per UPDATE ... WHERE id IN (...), well under SQLite's variable limit. */
const UPDATE_CHUNK = 500;

/** Every rule in the order they run: priority, then id. */
export function listRules(db: Db): Rule[] {
  return db.select().from(rules).orderBy(asc(rules.priority), asc(rules.id)).all();
}

/** 400 when the pattern cannot be saved (an invalid regex). */
function checkPattern(matchType: RuleMatchType, pattern: string): void {
  const error = rulePatternError(matchType, pattern);
  if (error !== null) {
    throw new HttpError(400, 'invalid_pattern', `Invalid pattern: ${error}`, { pattern });
  }
}

function invalidReference(what: string, id: number): HttpError {
  return new HttpError(400, 'invalid_reference', `Unknown ${what} id: ${id}`);
}

/**
 * 400 for an unknown category, account or owner, and for an enabled rule (or a changed
 * category) that would assign an archived category.
 */
function checkReferences(tx: Tx, rule: RuleFields, categoryChanged: boolean): void {
  const category = tx.select().from(categories).where(eq(categories.id, rule.setCategoryId)).get();
  if (category === undefined) throw invalidReference('category', rule.setCategoryId);
  if (category.archived && (categoryChanged || rule.enabled)) {
    throw new HttpError(
      400,
      'archived_category',
      `Category "${category.name}" is archived and cannot be assigned`,
    );
  }
  if (rule.accountId !== null) {
    const account = tx.select().from(accounts).where(eq(accounts.id, rule.accountId)).get();
    if (account === undefined) throw invalidReference('account', rule.accountId);
  }
  if (rule.setOwnerId !== null) {
    const owner = tx.select().from(owners).where(eq(owners.id, rule.setOwnerId)).get();
    if (owner === undefined) throw invalidReference('owner', rule.setOwnerId);
  }
}

export function createRule(db: Db, clock: Clock, input: RuleFields): Rule {
  checkPattern(input.matchType, input.pattern);
  return db.transaction((tx) => {
    checkReferences(tx, input, true);
    return tx
      .insert(rules)
      .values({ ...input, createdAt: clock() })
      .returning()
      .get();
  });
}

/** Applies a partial edit, checked as a whole rule. 404 when it does not exist. */
export function updateRule(db: Db, id: number, patch: UpdateRuleRequest): Rule {
  return db.transaction((tx) => {
    const current = tx.select().from(rules).where(eq(rules.id, id)).get();
    if (current === undefined) throw notFound('Rule', id);
    const merged: RuleFields = { ...current, ...patch };
    checkPattern(merged.matchType, merged.pattern);
    checkReferences(tx, merged, patch.setCategoryId !== undefined);
    if (Object.keys(patch).length === 0) return current;
    return tx.update(rules).set(patch).where(eq(rules.id, id)).returning().get();
  });
}

/**
 * Deletes a rule. Transactions it categorized keep their category and stay rule-categorized
 * (so a later apply may recategorize them), but no longer point at it.
 */
export function deleteRule(db: Db, id: number): number {
  return db.transaction((tx) => {
    const current = tx.select({ id: rules.id }).from(rules).where(eq(rules.id, id)).get();
    if (current === undefined) throw notFound('Rule', id);
    tx.update(transactions).set({ ruleId: null }).where(eq(transactions.ruleId, id)).run();
    tx.delete(rules).where(eq(rules.id, id)).run();
    return id;
  });
}

/**
 * POST /rules/test: how many transactions an unsaved rule matches (whether or not it is
 * enabled, and whatever their category source), and the newest ten of them.
 */
export function testRule(db: Db, input: RuleFields): TestRuleResponse {
  checkPattern(input.matchType, input.pattern);
  const candidates = db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      description: transactions.description,
      memo: transactions.memo,
      bankCategory: transactions.bankCategory,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(input.accountId === null ? undefined : eq(transactions.accountId, input.accountId))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
  const matched = candidates.filter((row) => ruleMatches(input, row)).map((row) => row.id);
  const sampleIds = matched.slice(0, SAMPLE_SIZE);
  const byId = new Map<number, Transaction>(
    sampleIds.length === 0
      ? []
      : db
          .select()
          .from(transactions)
          .where(inArray(transactions.id, sampleIds))
          .all()
          .map((row) => [row.id, row]),
  );
  const samples = sampleIds.flatMap((id) => byId.get(id) ?? []);
  return { matchCount: matched.length, samples };
}

/**
 * POST /rules/apply: runs the active rules over every uncategorized or rule-categorized
 * transaction. A row whose first matching rule would set a different category or rule gets that
 * category, `category_source = rule`, the rule, and the rule's owner when it sets one. Manual
 * and accepted-suggestion categories are never touched, and rows no rule matches are left as
 * they are. Returns how many rows changed.
 */
export function applyRules(db: Db, clock: Clock): number {
  return db.transaction((tx) => {
    const match = createRuleMatcher(activeRules(tx));
    const rows = tx
      .select({
        id: transactions.id,
        accountId: transactions.accountId,
        description: transactions.description,
        memo: transactions.memo,
        bankCategory: transactions.bankCategory,
        amountCents: transactions.amountCents,
        categoryId: transactions.categoryId,
        ruleId: transactions.ruleId,
      })
      .from(transactions)
      .where(or(isNull(transactions.categorySource), eq(transactions.categorySource, 'rule')))
      .all();

    const idsByRule = new Map<Rule, number[]>();
    for (const row of rows) {
      const rule = match(row);
      if (rule === null) continue;
      if (row.categoryId === rule.setCategoryId && row.ruleId === rule.id) continue;
      const ids = idsByRule.get(rule) ?? [];
      ids.push(row.id);
      idsByRule.set(rule, ids);
    }

    const now = clock();
    let changed = 0;
    for (const [rule, ids] of idsByRule) {
      const set = {
        categoryId: rule.setCategoryId,
        categorySource: 'rule' as const,
        ruleId: rule.id,
        updatedAt: now,
        ...(rule.setOwnerId === null ? {} : { ownerId: rule.setOwnerId }),
      };
      for (let i = 0; i < ids.length; i += UPDATE_CHUNK) {
        const chunk = ids.slice(i, i + UPDATE_CHUNK);
        tx.update(transactions).set(set).where(inArray(transactions.id, chunk)).run();
      }
      changed += ids.length;
    }
    return changed;
  });
}
