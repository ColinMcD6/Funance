import type { TransactionListItem } from '@funance/shared';
import { Badge } from '@/components/ui/badge';

/** A transaction's description with its memo, note and excluded flag underneath. */
export function RowDetails({ item }: { item: TransactionListItem }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="break-words">{item.description}</span>
      {item.memo !== null && item.memo !== item.description && (
        <span className="text-muted-foreground text-xs break-words">{item.memo}</span>
      )}
      {item.notes !== null && (
        <span className="text-muted-foreground text-xs break-words italic">{item.notes}</span>
      )}
      {item.excluded && (
        <span>
          <Badge variant="secondary">Excluded</Badge>
        </span>
      )}
    </div>
  );
}
