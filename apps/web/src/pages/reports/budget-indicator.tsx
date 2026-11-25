import type { BudgetStatus } from '@funance/core/budgets';
import { formatCents } from '@funance/core/money';
import { cn } from '@/lib/utils';
import type { CompareSection } from './report-view';

/**
 * A bar showing how much of a category's budget this month used, and the amount over or under
 * it with its sign: `+$20.00 over` (actual above budget) or `-$15.00 under`. Over budget is bad
 * for spending (red) and good for income and saved (green).
 */
export function BudgetIndicator({
  status,
  section,
}: {
  status: BudgetStatus;
  section: CompareSection;
}) {
  const diff = status.differenceCents;
  const over = diff > 0;
  const good = section === 'spending' ? diff <= 0 : diff >= 0;
  const width =
    status.percentUsed === null
      ? status.actualCents > 0
        ? 100
        : 0
      : Math.max(0, Math.min(100, status.percentUsed));
  const text =
    diff === 0 ? 'on budget' : `${over ? '+' : ''}${formatCents(diff)} ${over ? 'over' : 'under'}`;
  return (
    <span
      className="flex w-full max-w-48 flex-col gap-0.5"
      data-testid="budget-indicator"
      data-difference-cents={diff}
    >
      <span
        role="meter"
        aria-label={`Budget ${formatCents(status.budgetCents)}`}
        aria-valuemin={0}
        aria-valuemax={status.budgetCents}
        aria-valuenow={Math.max(0, status.actualCents)}
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
      >
        <span
          className={cn('block h-full rounded-full', good ? 'bg-green-600' : 'bg-destructive')}
          style={{ width: `${String(width)}%` }}
        />
      </span>
      <span className="text-muted-foreground text-xs">
        <span
          className={cn(
            'tabular-nums',
            diff !== 0 && (good ? 'text-green-700' : 'text-destructive'),
          )}
          data-testid="budget-difference"
        >
          {text}
        </span>{' '}
        of {formatCents(status.budgetCents)}
      </span>
    </span>
  );
}
