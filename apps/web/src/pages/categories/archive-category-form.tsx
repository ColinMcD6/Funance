import type { Category } from '@funance/shared';
import { useState } from 'react';
import { useArchiveCategory } from '@/api/queries';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { CategorySelect } from '@/pages/transactions/category-select';

type Props = { category: Category; categories: readonly Category[]; onDone: () => void };

/**
 * Confirms archiving a category, optionally moving its transactions (and the rules that set it)
 * to another category first.
 */
export function ArchiveCategoryForm({ category, categories, onDone }: Props) {
  const [reassignTo, setReassignTo] = useState('');
  const archive = useArchiveCategory();
  const others = categories.filter((c) => c.id !== category.id);

  return (
    <form
      aria-label={`Archive ${category.name}`}
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        archive.mutate(
          { id: category.id, reassignTo: reassignTo === '' ? undefined : Number(reassignTo) },
          { onSuccess: onDone },
        );
      }}
    >
      <p className="text-sm">
        Archived categories keep their history but cannot be assigned to new transactions. Rules
        that set {category.name} are disabled, unless you move them below.
      </p>
      <FormField label="Move its transactions and rules to">
        {(id) => (
          <CategorySelect
            id={id}
            categories={others}
            leading={[{ value: '', label: `Keep them on ${category.name}` }]}
            value={reassignTo}
            onChange={(e) => {
              setReassignTo(e.target.value);
            }}
          />
        )}
      </FormField>
      {archive.isError && (
        <p role="alert" className="text-destructive text-sm">
          {archive.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="destructive" disabled={archive.isPending}>
          Archive {category.name}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
