import type { TransactionListItem } from '@funance/shared';
import { NativeSelect } from '@/components/native-select';
import type { EditTransaction, Lookups } from './lookups';

type Props = { item: TransactionListItem; lookups: Lookups; onEdit: EditTransaction };

/** The inline owner select of one transaction. */
export function OwnerEdit({ item, lookups, onEdit }: Props) {
  return (
    <NativeSelect
      aria-label="Owner"
      value={item.ownerId}
      onChange={(e) => {
        onEdit(item.id, { ownerId: Number(e.target.value) });
      }}
    >
      {lookups.owners.map((owner) => (
        <option key={owner.id} value={owner.id}>
          {owner.name}
        </option>
      ))}
    </NativeSelect>
  );
}
