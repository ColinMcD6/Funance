import { useState } from 'react';
import { useCategories, useUpdateCategory } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { moveOrder } from '@/lib/reorder';
import { CategoryRow } from './category-row';
import { NewCategoryForm } from './new-category-form';

/** Categories: create, rename, kind, color, reorder, and archive with reassignment. */
export function CategoriesPage() {
  const categories = useCategories();
  const update = useUpdateCategory();
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const all = categories.data ?? [];
  const active = all.filter((c) => !c.archived);
  const archived = all.filter((c) => c.archived);
  const groups = [...new Set(all.map((c) => c.groupName))].sort((a, b) => a.localeCompare(b));

  const move = async (index: number, delta: -1 | 1) => {
    const patches = moveOrder(
      active.map((c) => ({ id: c.id, order: c.sortOrder })),
      index,
      delta,
    );
    setMoving(true);
    setMoveError(null);
    try {
      for (const { id, order } of patches) {
        await update.mutateAsync({ id, patch: { sortOrder: order } });
      }
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Could not move the category');
    } finally {
      setMoving(false);
    }
  };

  const rowProps = { categories: all, groups, moving };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Categories</h1>
        {!creating && (
          <Button
            onClick={() => {
              setCreating(true);
            }}
          >
            New category
          </Button>
        )}
      </div>
      {creating && (
        <NewCategoryForm
          groups={groups}
          onDone={() => {
            setCreating(false);
          }}
        />
      )}
      {categories.isError && (
        <p role="alert" className="text-destructive text-sm">
          {categories.error.message}
        </p>
      )}
      {moveError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {moveError}
        </p>
      )}
      <ul aria-label="Categories" className="flex flex-col divide-y rounded-md border">
        {active.map((category, index) => (
          <CategoryRow
            key={category.id}
            category={category}
            {...rowProps}
            onMoveUp={
              index > 0
                ? () => {
                    void move(index, -1);
                  }
                : undefined
            }
            onMoveDown={
              index < active.length - 1
                ? () => {
                    void move(index, 1);
                  }
                : undefined
            }
          />
        ))}
      </ul>
      {archived.length > 0 && (
        <section aria-labelledby="archived-heading" className="flex flex-col gap-3">
          <h2 id="archived-heading" className="text-lg font-semibold">
            Archived
          </h2>
          <ul aria-label="Archived categories" className="flex flex-col divide-y rounded-md border">
            {archived.map((category) => (
              <CategoryRow key={category.id} category={category} {...rowProps} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
