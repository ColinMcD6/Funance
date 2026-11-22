import type { Category } from '@funance/shared';
import { useState } from 'react';
import { useUpdateCategory } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { CategoryFields, type CategoryDraft } from './category-fields';

type Props = { category: Category; groups: string[]; onDone: () => void };

/** Renames a category and changes its kind, color and major category. */
export function EditCategoryForm({ category, groups, onDone }: Props) {
  const [draft, setDraft] = useState<CategoryDraft>({
    name: category.name,
    kind: category.kind,
    color: category.color,
    groupName: category.groupName,
  });
  const update = useUpdateCategory();
  const valid = draft.name.trim() !== '' && draft.groupName.trim() !== '';

  return (
    <form
      aria-label={`Edit ${category.name}`}
      className="flex w-full flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        update.mutate(
          {
            id: category.id,
            patch: { ...draft, name: draft.name.trim(), groupName: draft.groupName.trim() },
          },
          { onSuccess: onDone },
        );
      }}
    >
      <CategoryFields draft={draft} onChange={setDraft} groups={groups} />
      {update.isError && (
        <p role="alert" className="text-destructive text-sm">
          {update.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={!valid || update.isPending}>
          Save
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
