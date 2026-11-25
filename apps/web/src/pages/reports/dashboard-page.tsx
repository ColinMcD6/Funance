import { reportTotals } from '@funance/core/reports';
import { lazy, Suspense } from 'react';
import { useNavigate } from 'react-router';
import {
  useBudgets,
  useCategories,
  useCompareReport,
  useMonthlyReport,
  useOwners,
} from '@/api/queries';
import { lineBudget } from './budget-view';
import { ChartLoading } from './chart-loading';
import { CompareTable } from './compare-table';
import { ReportControls } from './report-controls';
import {
  compareLines,
  monthLabel,
  spendingBreakdown,
  transactionsLink,
  type Bucket,
} from './report-view';
import { SummaryCards } from './summary-cards';
import { useReportView } from './use-report-view';

// Charts load on demand: the charting library is in its own chunk.
const BreakdownChart = lazy(async () => ({
  default: (await import('./breakdown-chart')).BreakdownChart,
}));

/**
 * Dashboard: one month's income, spending, saved and left over for an owner (or everyone), a
 * spending breakdown chart, and a table comparing each category with earlier months. Every
 * category leads to the Transactions list behind its figure.
 */
export function DashboardPage() {
  const [view, change] = useReportView();
  const navigate = useNavigate();
  const owners = useOwners();
  const categories = useCategories();
  const monthly = useMonthlyReport({
    from: view.month,
    to: view.month,
    owner: view.owner,
    groupBy: view.groupBy,
  });
  const compare = useCompareReport({ month: view.month, owner: view.owner });
  const budgets = useBudgets();

  const categoryList = categories.data ?? [];
  const rows = monthly.data?.rows ?? [];
  const totals = reportTotals(rows);
  const linkFor = (bucket: Pick<Bucket, 'categoryId'>): string | null =>
    bucket.categoryId === undefined
      ? null
      : transactionsLink({
          categoryId: bucket.categoryId,
          from: view.month,
          to: view.month,
          owner: view.owner,
        });

  const error = monthly.error ?? compare.error ?? budgets.error;
  const budgetList = budgets.data ?? [];
  const loading = monthly.isPlaceholderData || compare.isPlaceholderData;

  return (
    <div className="flex max-w-6xl min-w-0 flex-col gap-4">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <ReportControls view={view} owners={owners.data ?? []} onChange={change} />
      <h2 className="text-lg font-medium" data-testid="dashboard-month">
        {monthLabel(view.month)}
      </h2>
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      <div className={loading ? 'opacity-60' : undefined}>
        {monthly.isSuccess && (
          <SummaryCards
            totals={totals}
            uncategorizedLink={transactionsLink({
              categoryId: null,
              from: view.month,
              to: view.month,
              owner: view.owner,
            })}
          />
        )}
      </div>
      <section className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <h2 className="font-medium">
          Spending by {view.groupBy === 'group' ? 'major category' : 'category'}
        </h2>
        {monthly.isSuccess && (
          <Suspense fallback={<ChartLoading />}>
            <BreakdownChart
              bars={spendingBreakdown(rows, categoryList)}
              onSelect={(bar) => {
                const to = linkFor(bar);
                if (to !== null) void navigate(to);
              }}
            />
          </Suspense>
        )}
      </section>
      <section className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm">
        <h2 className="font-medium">Compared with earlier months</h2>
        {compare.isSuccess && (
          <CompareTable
            lines={compareLines(compare.data.rows, categoryList, view.groupBy)}
            linkFor={linkFor}
            budgetFor={(line) => lineBudget(line, budgetList, categoryList, view.month, view.owner)}
          />
        )}
        {view.groupBy === 'group' && (
          <p className="text-muted-foreground text-xs">
            Switch to Categories to open the transactions behind a figure.
          </p>
        )}
      </section>
    </div>
  );
}
