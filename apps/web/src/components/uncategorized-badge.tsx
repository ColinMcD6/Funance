import { useUncategorizedCount } from '@/api/queries';
import { cn } from '@/lib/utils';

/**
 * The number of uncategorized transactions next to the Uncategorized nav item; hidden at zero.
 * `compact` places it over the icon in the phone bottom bar. It is aria-hidden so the link's
 * name stays "Uncategorized"; the page itself states the count.
 */
export function UncategorizedBadge({ compact }: { compact: boolean }) {
  const count = useUncategorizedCount();
  if (count.data === undefined || count.data === 0) return null;
  return (
    <span
      aria-hidden
      data-testid="uncategorized-badge"
      title={`${count.data} uncategorized`}
      className={cn(
        'bg-destructive rounded-full px-1.5 text-[10px] leading-4 font-semibold text-white tabular-nums',
        compact ? 'absolute -top-1 left-1/2 ml-1.5' : 'ml-auto',
      )}
    >
      {count.data > 999 ? '999+' : count.data}
    </span>
  );
}
