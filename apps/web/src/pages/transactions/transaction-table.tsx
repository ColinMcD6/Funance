import type { TransactionListItem, TransactionQuery } from '@funance/shared';
import { cn } from '@/lib/utils';
import { AmountText } from './amount-text';
import { CategoryEdit } from './category-edit';
import { accountName, type EditTransaction, type Lookups } from './lookups';
import { OwnerEdit } from './owner-edit';
import { RowDetails } from './row-details';
import { SelectBox } from './select-box';
import { SortHeader } from './sort-header';

type Props = {
  items: readonly TransactionListItem[];
  lookups: Lookups;
  query: TransactionQuery;
  selected: ReadonlySet<number>;
  onToggle: (id: number) => void;
  onToggleAll: () => void;
  onSort: (change: Pick<TransactionQuery, 'sort' | 'order'>) => void;
  onEdit: EditTransaction;
};

/** The transaction list on wide screens: sortable columns and inline owner and category. */
export function TransactionTable({
  items,
  lookups,
  query,
  selected,
  onToggle,
  onToggleAll,
  onSort,
  onEdit,
}: Props) {
  const allSelected = items.length > 0 && items.every((t) => selected.has(t.id));
  const someSelected = !allSelected && items.some((t) => selected.has(t.id));
  return (
    <div className="hidden overflow-x-auto rounded-md border md:block">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-muted-foreground text-left">
          <tr>
            <th className="w-8 p-2">
              <SelectBox
                label="Select all on this page"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={onToggleAll}
              />
            </th>
            <SortHeader label="Date" column="date" query={query} onSort={onSort} />
            <SortHeader label="Description" column="description" query={query} onSort={onSort} />
            <th className="p-2 font-medium">Account</th>
            <th className="p-2 font-medium">Owner</th>
            <th className="p-2 font-medium">Category</th>
            <SortHeader
              label="Amount"
              column="amount"
              query={query}
              onSort={onSort}
              className="text-right"
            />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              data-testid="transaction-row"
              className={cn('border-t align-top', item.excluded && 'text-muted-foreground')}
            >
              <td className="p-2">
                <SelectBox
                  label={`Select ${item.description}`}
                  checked={selected.has(item.id)}
                  onChange={() => {
                    onToggle(item.id);
                  }}
                />
              </td>
              <td className="p-2 whitespace-nowrap tabular-nums">{item.date}</td>
              <td className="p-2">
                <RowDetails item={item} />
              </td>
              <td className="p-2">{accountName(lookups, item.accountId)}</td>
              <td className="w-32 p-2">
                <OwnerEdit item={item} lookups={lookups} onEdit={onEdit} />
              </td>
              <td className="w-48 p-2">
                <CategoryEdit item={item} lookups={lookups} onEdit={onEdit} />
              </td>
              <td className="p-2 text-right" data-testid="amount">
                <AmountText cents={item.amountCents} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
