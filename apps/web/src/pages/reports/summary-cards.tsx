import { formatCents } from '@funance/core/money';
import type { ReportTotals } from '@funance/core/reports';
import { TriangleAlert } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';

function SummaryCard({
  label,
  cents,
  testId,
  tone,
}: {
  label: string;
  cents: number;
  testId: string;
  tone?: 'good' | 'bad';
}) {
  return (
    <div className="bg-card rounded-xl border p-4 shadow-sm">
      <div className="text-muted-foreground text-sm">{label}</div>
      <div
        data-testid={testId}
        className={cn(
          'mt-1 text-xl font-semibold tabular-nums sm:text-2xl',
          tone === 'good' && 'text-green-700',
          tone === 'bad' && 'text-destructive',
        )}
      >
        {formatCents(cents)}
      </div>
    </div>
  );
}

/** Income, spending, saved and left over for the month, and a warning for uncategorized rows. */
export function SummaryCards({
  totals,
  uncategorizedLink,
}: {
  totals: ReportTotals;
  uncategorizedLink: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Income" cents={totals.incomeCents} testId="total-income" />
        <SummaryCard label="Spending" cents={totals.spendingCents} testId="total-spending" />
        <SummaryCard label="Saved" cents={totals.savedCents} testId="total-saved" />
        <SummaryCard
          label="Left over"
          cents={totals.leftOverCents}
          testId="total-left-over"
          tone={totals.leftOverCents < 0 ? 'bad' : 'good'}
        />
      </div>
      {totals.uncategorizedCount > 0 && (
        <Link
          to={uncategorizedLink}
          data-testid="uncategorized-warning"
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          <TriangleAlert className="size-4 shrink-0" />
          <span>
            {totals.uncategorizedCount} uncategorized{' '}
            {totals.uncategorizedCount === 1 ? 'transaction' : 'transactions'} (
            {formatCents(totals.uncategorizedCents)}) not counted in these totals.
          </span>
        </Link>
      )}
    </div>
  );
}
