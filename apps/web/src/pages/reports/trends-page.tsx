import { monthsBetween } from '@funance/core/reports';
import { lazy, Suspense, useState } from 'react';
import { useNavigate } from 'react-router';
import { useCategories, useMonthlyReport, useOwners } from '@/api/queries';
import { Checkbox } from '@/components/ui/checkbox';
import { ChartLoading } from './chart-loading';
import { ReportControls } from './report-controls';
import { spendingTrend, transactionsLink, trendMonths, type Span } from './report-view';
import { SegmentedControl } from './segmented-control';
import { useReportView } from './use-report-view';

// Charts load on demand: the charting library is in its own chunk.
const TrendStackChart = lazy(async () => ({
  default: (await import('./trend-stack-chart')).TrendStackChart,
}));
const TrendLineChart = lazy(async () => ({
  default: (await import('./trend-line-chart')).TrendLineChart,
}));

/** How many of the largest buckets the line chart shows before the user picks any. */
const DEFAULT_LINES = 3;

/**
 * Trends: monthly spending stacked by category over 12 or 24 months, and a line per selected
 * category. Clicking a segment opens that category's transactions for that month.
 */
export function TrendsPage() {
  const [view, change] = useReportView();
  const navigate = useNavigate();
  const owners = useOwners();
  const categories = useCategories();
  const range = trendMonths(view.month, view.span);
  const monthly = useMonthlyReport({ ...range, owner: view.owner, groupBy: view.groupBy });

  const { points, buckets } = spendingTrend(
    monthly.data?.rows ?? [],
    monthsBetween(range.from, range.to),
    categories.data ?? [],
  );

  // Picked lines, per grouping; until the user picks, the largest few are shown.
  const [picked, setPicked] = useState<Record<string, readonly string[] | undefined>>({});
  const totals = new Map(
    buckets.map((b) => [b.key, points.reduce((n, p) => n + Number(p[b.key] ?? 0), 0)]),
  );
  const largest = [...buckets]
    .sort((a, b) => (totals.get(b.key) ?? 0) - (totals.get(a.key) ?? 0))
    .slice(0, DEFAULT_LINES)
    .map((b) => b.key);
  const selected = new Set(picked[view.groupBy] ?? largest);
  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setPicked({ ...picked, [view.groupBy]: [...next] });
  };

  return (
    <div className="flex max-w-6xl min-w-0 flex-col gap-4">
      <h1 className="text-2xl font-semibold">Trends</h1>
      <ReportControls
        view={view}
        owners={owners.data ?? []}
        onChange={change}
        monthLabel="Ending month"
      />
      <SegmentedControl<Span>
        label="Months shown"
        options={[
          { value: 12, label: '12 months' },
          { value: 24, label: '24 months' },
        ]}
        value={view.span}
        onChange={(span) => {
          change({ span });
        }}
      />
      {monthly.error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {monthly.error.message}
        </p>
      )}
      <section
        className={`bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm ${monthly.isPlaceholderData ? 'opacity-60' : ''}`}
      >
        <h2 className="font-medium">Monthly spending</h2>
        {monthly.isSuccess && buckets.length === 0 && (
          <p className="text-muted-foreground text-sm">No spending in these months.</p>
        )}
        {buckets.length > 0 && (
          <Suspense fallback={<ChartLoading />}>
            <TrendStackChart
              points={points}
              buckets={buckets}
              onSelect={(bucket, month) => {
                if (bucket.categoryId === undefined) return;
                void navigate(
                  transactionsLink({
                    categoryId: bucket.categoryId,
                    from: month,
                    to: month,
                    owner: view.owner,
                  }),
                );
              }}
            />
          </Suspense>
        )}
      </section>
      {buckets.length > 0 && (
        <section className="bg-card flex min-w-0 flex-col gap-3 rounded-xl border p-4 shadow-sm">
          <h2 className="font-medium">
            By {view.groupBy === 'group' ? 'major category' : 'category'}
          </h2>
          <Suspense fallback={<ChartLoading />}>
            <TrendLineChart points={points} buckets={buckets.filter((b) => selected.has(b.key))} />
          </Suspense>
          <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
            <legend className="sr-only">Lines shown</legend>
            {buckets.map((bucket) => (
              <label key={bucket.key} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={selected.has(bucket.key)}
                  onCheckedChange={() => {
                    toggle(bucket.key);
                  }}
                />
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: bucket.color }}
                />
                {bucket.label}
              </label>
            ))}
          </fieldset>
        </section>
      )}
    </div>
  );
}
