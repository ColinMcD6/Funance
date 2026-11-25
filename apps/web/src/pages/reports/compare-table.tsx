import type { BudgetStatus } from '@funance/core/budgets';
import { formatCents } from '@funance/core/money';
import { Link } from 'react-router';
import { cn } from '@/lib/utils';
import { BudgetIndicator } from './budget-indicator';
import type { CompareLine, CompareSection } from './report-view';

const SECTION_LABELS: Record<CompareSection, string> = {
  spending: 'Spending',
  income: 'Income',
  saved: 'Saved',
};

function Money({ cents }: { cents: number | null }) {
  return <span className="tabular-nums">{cents === null ? '—' : formatCents(cents)}</span>;
}

/**
 * This month minus `other`. For spending more is worse, so an increase shows red; for income
 * and saved more is better, so it shows green.
 */
function Difference({
  cents,
  other,
  section,
}: {
  cents: number;
  other: number | null;
  section: CompareSection;
}) {
  if (other === null) return <span className="text-muted-foreground">—</span>;
  const diff = cents - other;
  const better = section === 'spending' ? diff < 0 : diff > 0;
  return (
    <span
      className={cn('tabular-nums', diff !== 0 && (better ? 'text-green-700' : 'text-destructive'))}
    >
      {diff > 0 ? '+' : ''}
      {formatCents(diff)}
    </span>
  );
}

/**
 * The dashboard's category table: this month, last month, the same month last year and the
 * 3-month average, with differences. Each line links to the matching Transactions list, except
 * major categories, which Transactions cannot filter by. On a phone the year and average
 * columns are hidden so the table fits.
 */
export function CompareTable({
  lines,
  linkFor,
  budgetFor = () => null,
}: {
  lines: readonly CompareLine[];
  linkFor: (line: CompareLine) => string | null;
  /** The line's budget status this month; null hides the budget indicator. */
  budgetFor?: (line: CompareLine) => BudgetStatus | null;
}) {
  if (lines.length === 0) {
    return <p className="text-muted-foreground text-sm">No transactions this month.</p>;
  }
  const wide = 'hidden md:table-cell';
  return (
    <table className="w-full text-sm" data-testid="compare-table">
      <thead>
        <tr className="text-muted-foreground border-b text-right">
          <th className="py-2 text-left font-medium">Category</th>
          <th className="py-2 pl-2 font-medium">This month</th>
          <th className="py-2 pl-2 font-medium">Last month</th>
          <th className="py-2 pl-2 font-medium">Change</th>
          <th className={cn('py-2 pl-2 font-medium', wide)}>Last year</th>
          <th className={cn('py-2 pl-2 font-medium', wide)}>3-month avg</th>
          <th className={cn('py-2 pl-2 font-medium', wide)}>vs avg</th>
        </tr>
      </thead>
      {(['spending', 'income', 'saved'] as const).map((section) => {
        const inSection = lines.filter((line) => line.section === section);
        if (inSection.length === 0) return null;
        return (
          <tbody key={section}>
            <tr>
              <th colSpan={7} className="pt-3 pb-1 text-left text-xs font-semibold uppercase">
                {SECTION_LABELS[section]}
              </th>
            </tr>
            {inSection.map((line) => {
              const to = linkFor(line);
              const budget = budgetFor(line);
              return (
                <tr key={line.key} className="border-b text-right" data-testid="compare-row">
                  <td className="py-2 text-left">
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: line.color }}
                      />
                      {to === null ? (
                        <span>{line.label}</span>
                      ) : (
                        <Link to={to} className="hover:underline">
                          {line.label}
                        </Link>
                      )}
                    </span>
                    {budget !== null && (
                      // Below the name, so the indicator fits a phone without another column.
                      <span className="mt-1 block pl-4.5">
                        <BudgetIndicator status={budget} section={section} />
                      </span>
                    )}
                  </td>
                  <td className="py-2 pl-2">
                    <Money cents={line.thisMonthCents} />
                  </td>
                  <td className="py-2 pl-2">
                    <Money cents={line.previousMonthCents} />
                  </td>
                  <td className="py-2 pl-2">
                    <Difference
                      cents={line.thisMonthCents}
                      other={line.previousMonthCents}
                      section={section}
                    />
                  </td>
                  <td className={cn('py-2 pl-2', wide)}>
                    <Money cents={line.sameMonthLastYearCents} />
                  </td>
                  <td className={cn('py-2 pl-2', wide)}>
                    <Money cents={line.trailing3MonthAvgCents} />
                  </td>
                  <td className={cn('py-2 pl-2', wide)}>
                    <Difference
                      cents={line.thisMonthCents}
                      other={line.trailing3MonthAvgCents}
                      section={section}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </table>
  );
}
