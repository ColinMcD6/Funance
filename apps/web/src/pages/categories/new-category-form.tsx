import { useState } from 'react';
import { useCreateCategory } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { CategoryFields, type CategoryDraft } from './category-fields';

const EMPTY: CategoryDraft = { name: '', kind: 'expense', color: '#64748b', groupName: '' };

/** Creates a category at the end of the list. */
export function NewCategoryForm({ groups, onDone }: { groups: string[]; onDone: () => void }) {
  const [draft, setDraft] = useState(EMPTY);
  const create = useCreateCategory();
  const valid = draft.name.trim() !== '' && draft.groupName.trim() !== '';

  return (
    <form
      aria-label="New category"
      className="flex flex-col gap-3 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        create.mutate(
          { ...draft, name: draft.name.trim(), groupName: draft.groupName.trim() },
          { onSuccess: onDone },
        );
      }}
    >
      <h2 className="font-semibold">New category</h2>
      <CategoryFields draft={draft} onChange={setDraft} groups={groups} />
      {create.isError && (
        <p role="alert" className="text-destructive text-sm">
          {create.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!valid || create.isPending}>
          Create
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
