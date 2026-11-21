import type { TransactionQuery } from '@funance/shared';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Sort = TransactionQuery['sort'];

/** The order a column starts in when first chosen: newest dates, A to Z, largest amounts. */
const FIRST_ORDER: Record<Sort, TransactionQuery['order']> = {
  date: 'desc',
  amount: 'desc',
  description: 'asc',
};

type Props = {
  label: string;
  column: Sort;
  query: TransactionQuery;
  onSort: (change: Pick<TransactionQuery, 'sort' | 'order'>) => void;
  className?: string;
};

/** A column header that sorts by its column; choosing it again reverses the order. */
export function SortHeader({ label, column, query, onSort, className }: Props) {
  const active = query.sort === column;
  const Icon = !active ? ArrowUpDown : query.order === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn('p-2 font-medium', className)}
      aria-sort={active ? (query.order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 hover:underline',
          active && 'text-foreground',
        )}
        onClick={() => {
          const order = active ? (query.order === 'asc' ? 'desc' : 'asc') : FIRST_ORDER[column];
          onSort({ sort: column, order });
        }}
      >
        {label}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-40')} />
      </button>
    </th>
  );
}
