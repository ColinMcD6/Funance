import type { TransactionListItem } from '@funance/shared';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AmountText } from '@/pages/transactions/amount-text';
import { CategorySelect } from '@/pages/transactions/category-select';
import { accountName, type EditTransaction, type Lookups } from '@/pages/transactions/lookups';
import { OwnerEdit } from '@/pages/transactions/owner-edit';
import { RowDetails } from '@/pages/transactions/row-details';

type Props = {
  item: TransactionListItem;
  lookups: Lookups;
  active: boolean;
  onActivate: () => void;
  onAccept: () => void;
  onPick: (categoryId: number) => void;
  onEdit: EditTransaction;
};

/** One uncategorized transaction: its suggestion as a one-tap button, a picker and its owner. */
export function QueueRow({ item, lookups, active, onActivate, onAccept, onPick, onEdit }: Props) {
  const suggestion =
    item.suggestedCategoryId == null
      ? undefined
      : lookups.categories.find((c) => c.id === item.suggestedCategoryId);
  return (
    <li
      data-testid="queue-row"
      data-row-id={item.id}
      tabIndex={-1}
      aria-current={active ? 'true' : undefined}
      onFocus={onActivate}
      onClick={onActivate}
      className={cn(
        'flex flex-col gap-2 p-3 text-sm outline-none',
        active && 'bg-muted/60 ring-ring/50 ring-2 ring-inset',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <RowDetails item={item} />
        <AmountText cents={item.amountCents} className="font-medium" />
      </div>
      <div className="text-muted-foreground text-xs tabular-nums">
        {item.date} · {accountName(lookups, item.accountId)}
      </div>
      <div className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_minmax(0,9rem)] sm:items-center">
        {suggestion === undefined ? (
          <span className="text-muted-foreground text-xs" data-testid="no-suggestion">
            No suggestion
          </span>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Accept ${suggestion.name}`}
            className="justify-start truncate"
            onClick={onAccept}
          >
            <Check aria-hidden />
            {suggestion.name}
          </Button>
        )}
        <CategorySelect
          aria-label="Category"
          categories={lookups.categories}
          leading={[{ value: '', label: 'Choose a category…' }]}
          value=""
          onChange={(e) => {
            if (e.target.value !== '') onPick(Number(e.target.value));
          }}
        />
        <OwnerEdit item={item} lookups={lookups} onEdit={onEdit} />
      </div>
    </li>
  );
}
