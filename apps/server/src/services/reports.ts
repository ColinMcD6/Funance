import {
  addMonths,
  buildCompareRows,
  directedCents,
  monthDateRange,
  type CategoryMonthAmount,
} from '@funance/core';
import type {
  CategoryKind,
  CompareReportQuery,
  CompareReportResponse,
  MonthlyReportQuery,
  MonthlyReportResponse,
} from '@funance/shared';
import {
  and,
  asc,
  count,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';
import type { Db } from '../db/migrate.js';
import { categories, transactions } from '../db/schema.js';
import { HttpError } from '../http.js';

// Reports are SQL aggregates over transactions joined to their category (PLAN.md section 2,
// "Conventions"): excluded rows and transfer categories are left out; spending and saved are
// negated sums, income a plain sum; uncategorized rows form their own bucket. Archived
// categories count like any other: they keep their history.

const t = transactions;
const c = categories;
const monthOf = sql<string>`substr(${t.date}, 1, 7)`;

/** Signed sum of amounts whose category has `kind`, as an integer (0 when there are none). */
function kindSum(kind: CategoryKind): SQL<number> {
  return sql<number>`coalesce(sum(case when ${c.kind} = ${kind} then ${t.amountCents} else 0 end), 0)`;
}

/** Rows that count in reports: not excluded, not a transfer, dated from..to, of `owner`. */
function reportedRows(from: string, to: string, owner: number | 'all'): SQL | undefined {
  return and(
    eq(t.excluded, false),
    or(isNull(t.categoryId), ne(c.kind, 'transfer')),
    gte(t.date, from),
    lte(t.date, to),
    owner === 'all' ? undefined : eq(t.ownerId, owner),
  );
}

/** GET /reports/monthly: per month and category (or major category), each kind's total. */
export function monthlyReport(db: Db, query: MonthlyReportQuery): MonthlyReportResponse {
  if (query.from > query.to) {
    throw new HttpError(400, 'validation_error', '`from` must not be after `to`');
  }
  const where = reportedRows(
    monthDateRange(query.from).from,
    monthDateRange(query.to).to,
    query.owner,
  );
  const byGroup = query.groupBy === 'group';
  const uncategorizedSum = sql<number>`coalesce(sum(case when ${c.id} is null then ${t.amountCents} else 0 end), 0)`;
  const rows = db
    .select({
      month: monthOf,
      categoryId: byGroup ? sql<null>`null` : t.categoryId,
      groupName: c.groupName,
      expense: kindSum('expense'),
      income: kindSum('income'),
      savings: kindSum('savings'),
      uncategorized: uncategorizedSum,
      count: count(),
    })
    .from(t)
    .leftJoin(c, eq(c.id, t.categoryId))
    .where(where)
    .groupBy(monthOf, byGroup ? c.groupName : t.categoryId)
    .orderBy(asc(monthOf), sql`min(${c.sortOrder}) is null`, sql`min(${c.sortOrder})`)
    .all();

  return {
    rows: rows.map((row) => ({
      month: row.month,
      categoryId: row.categoryId,
      groupName: row.groupName,
      // `0 - x` so an empty sum is 0, not -0. Uncategorized rows count as spending in their
      // own bucket; reportTotals in core keeps that bucket out of the spending total.
      spendingCents: 0 - row.expense - row.uncategorized,
      incomeCents: row.income,
      savedCents: 0 - row.savings,
      count: row.count,
    })),
  };
}

/** GET /reports/compare: per category, this month against three earlier views. */
export function compareReport(db: Db, query: CompareReportQuery): CompareReportResponse {
  const { month, owner } = query;
  const first = addMonths(month, -12);
  // The months the comparison reads: last year, the three before, and this one.
  const windows = [first, addMonths(month, -3), addMonths(month, -2), addMonths(month, -1), month];
  const span = and(gte(t.date, monthDateRange(first).from), lte(t.date, monthDateRange(month).to));
  const where = and(
    reportedRows(monthDateRange(first).from, monthDateRange(month).to, owner),
    inArray(monthOf, windows),
  );

  const sums = db
    .select({
      month: monthOf,
      categoryId: t.categoryId,
      kind: c.kind,
      cents: sum(t.amountCents).mapWith(Number),
    })
    .from(t)
    .leftJoin(c, eq(c.id, t.categoryId))
    .where(where)
    .groupBy(monthOf, t.categoryId)
    .all();

  const amounts: CategoryMonthAmount[] = [];
  for (const row of sums) {
    const cents = directedCents(row.kind, row.cents);
    if (cents !== null) amounts.push({ month: row.month, categoryId: row.categoryId, cents });
  }

  // A month "has data" when the household has any transaction in it at all, whatever its
  // owner, category or excluded flag: only a month the data does not cover is null.
  const monthsWithData = new Set(
    db
      .selectDistinct({ month: monthOf })
      .from(t)
      .where(and(span, inArray(monthOf, windows)))
      .all()
      .map((row) => row.month),
  );

  const order = db
    .select({ id: c.id })
    .from(c)
    .orderBy(asc(c.sortOrder), asc(c.id))
    .all()
    .map((row) => row.id);

  return {
    month,
    rows: buildCompareRows(month, amounts, monthsWithData, order),
  };
}
