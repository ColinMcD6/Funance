import { formatCents } from '@funance/core/money';
import { cn } from '@/lib/utils';

/** A signed amount; money coming in is green. */
export function AmountText({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn('tabular-nums whitespace-nowrap', cents > 0 && 'text-green-700', className)}
    >
      {formatCents(cents)}
    </span>
  );
}
