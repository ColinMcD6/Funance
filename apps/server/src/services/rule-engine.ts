import type { Db } from '../db/migrate.js';

/** A database, or the transaction an import commit runs in. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/** The fields of an imported row that rules can match on (PLAN.md section 2, "rules"). */
export type RuleCandidate = {
  accountId: number | null;
  description: string;
  memo: string | null;
  bankCategory: string | null;
  amountCents: number;
};

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
 * M4 ships the no-op engine below; M6 provides the real one (reading enabled rules from `db`)
 * and passes it to `createApp` as `ruleEngine`.
 */
export type RuleEngine = (
  db: DbOrTx,
  candidates: readonly RuleCandidate[],
) => (RuleAssignment | null)[];

/** Matches nothing. The import flow's default until M6 lands. */
export const noopRuleEngine: RuleEngine = (_db, candidates) => candidates.map(() => null);
