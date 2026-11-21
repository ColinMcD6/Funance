import type { TransactionListItem } from '@funance/shared';
import { cn } from '@/lib/utils';
import { AmountText } from './amount-text';
import { CategoryEdit } from './category-edit';
import { accountName, type EditTransaction, type Lookups } from './lookups';
import { OwnerEdit } from './owner-edit';
import { RowDetails } from './row-details';
import { SelectBox } from './select-box';

type Props = {
  items: readonly TransactionListItem[];
  lookups: Lookups;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onEdit: EditTransaction;
};

/** The transaction list on phones: one card per transaction with its owner and category. */
export function TransactionCards({ items, lookups, selected, onToggle, onEdit }: Props) {
  return (
    <ul className="flex flex-col divide-y rounded-md border md:hidden">
      {items.map((item) => (
        <li
          key={item.id}
          data-testid="transaction-card"
          className={cn('flex gap-3 p-3 text-sm', item.excluded && 'text-muted-foreground')}
        >
          <div className="pt-0.5">
            <SelectBox
              label={`Select ${item.description}`}
              checked={selected.has(item.id)}
              onChange={() => {
                onToggle(item.id);
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <RowDetails item={item} />
              <span data-testid="amount" className="font-medium">
                <AmountText cents={item.amountCents} />
              </span>
            </div>
            <div className="text-muted-foreground text-xs tabular-nums">
              {item.date} · {accountName(lookups, item.accountId)}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <OwnerEdit item={item} lookups={lookups} onEdit={onEdit} />
              <CategoryEdit item={item} lookups={lookups} onEdit={onEdit} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
