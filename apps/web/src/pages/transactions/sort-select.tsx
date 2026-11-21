import type { TransactionQuery } from '@funance/shared';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';

const SORT_OPTIONS = [
  { value: 'date:desc', label: 'Date, newest first' },
  { value: 'date:asc', label: 'Date, oldest first' },
  { value: 'amount:desc', label: 'Amount, highest first' },
  { value: 'amount:asc', label: 'Amount, lowest first' },
  { value: 'description:asc', label: 'Description, A to Z' },
  { value: 'description:desc', label: 'Description, Z to A' },
] as const;

type Props = {
  query: TransactionQuery;
  onChange: (change: Pick<TransactionQuery, 'sort' | 'order'>) => void;
};

/** The sort order on phones, where the table's sortable headers are hidden. */
export function SortSelect({ query, onChange }: Props) {
  return (
    <div className="w-56 md:hidden">
      <FormField label="Sort">
        {(id) => (
          <NativeSelect
            id={id}
            value={`${query.sort}:${query.order}`}
            onChange={(e) => {
              const option = SORT_OPTIONS.find((o) => o.value === e.target.value);
              if (option === undefined) return;
              const [sort, order] = option.value.split(':') as [
                TransactionQuery['sort'],
                TransactionQuery['order'],
              ];
              onChange({ sort, order });
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        )}
      </FormField>
    </div>
  );
}
