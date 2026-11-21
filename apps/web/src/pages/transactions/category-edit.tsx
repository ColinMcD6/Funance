import type { TransactionListItem } from '@funance/shared';
import { CategorySelect } from './category-select';
import type { EditTransaction, Lookups } from './lookups';

type Props = { item: TransactionListItem; lookups: Lookups; onEdit: EditTransaction };

/** The inline category select of one transaction; choosing one records a manual category. */
export function CategoryEdit({ item, lookups, onEdit }: Props) {
  return (
    <CategorySelect
      aria-label="Category"
      categories={lookups.categories}
      leading={[{ value: '', label: 'Uncategorized' }]}
      value={item.categoryId === null ? '' : String(item.categoryId)}
      onChange={(e) => {
        const value = e.target.value;
        onEdit(item.id, { categoryId: value === '' ? null : Number(value) });
      }}
    />
  );
}
