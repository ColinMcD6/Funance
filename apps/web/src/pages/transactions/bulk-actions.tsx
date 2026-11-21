import type { TransactionPatch } from '@funance/shared';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { CategorySelect } from './category-select';
import type { Lookups } from './lookups';

type Props = {
  count: number;
  lookups: Lookups;
  pending: boolean;
  onApply: (patch: TransactionPatch) => void;
  onClear: () => void;
};

/** Actions for the selected rows: set owner, set category, exclude or include. */
export function BulkActions({ count, lookups, pending, onApply, onClear }: Props) {
  return (
    <section
      aria-label="Bulk actions"
      className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
    >
      <span className="font-medium" data-testid="selected-count">
        {count} selected
      </span>
      <NativeSelect
        aria-label="Set owner of selected"
        className="w-auto"
        value=""
        disabled={pending}
        onChange={(e) => {
          if (e.target.value !== '') onApply({ ownerId: Number(e.target.value) });
        }}
      >
        <option value="">Set owner…</option>
        {lookups.owners.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </NativeSelect>
      <CategorySelect
        aria-label="Set category of selected"
        className="w-auto"
        categories={lookups.categories}
        leading={[
          { value: '', label: 'Set category…' },
          { value: 'none', label: 'Uncategorized' },
        ]}
        value=""
        disabled={pending}
        onChange={(e) => {
          const value = e.target.value;
          if (value === '') return;
          onApply({ categoryId: value === 'none' ? null : Number(value) });
        }}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          onApply({ excluded: true });
        }}
      >
        Exclude
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          onApply({ excluded: false });
        }}
      >
        Include
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        Clear selection
      </Button>
    </section>
  );
}
