import type { Category } from '@funance/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { useUpdateCategory } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArchiveCategoryForm } from './archive-category-form';
import { EditCategoryForm } from './edit-category-form';
import { KIND_BADGES } from './kind-labels';

type Props = {
  category: Category;
  categories: readonly Category[];
  groups: string[];
  /** Moves the row up or down; absent at the ends of the list or for archived rows. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moving: boolean;
};

/** One category with its swatch, kind and group, and Edit, Archive or Restore, and reorder. */
export function CategoryRow({ category, categories, groups, onMoveUp, onMoveDown, moving }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'archive'>('view');
  const restore = useUpdateCategory();
  const close = () => {
    setMode('view');
  };

  return (
    <li data-testid="category-row" className="flex flex-col gap-3 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden
            className="size-4 shrink-0 rounded-full border"
            style={{ backgroundColor: category.color }}
          />
          <div className="flex min-w-0 flex-col">
            <span className="flex flex-wrap items-center gap-2 font-medium">
              <span className="truncate">{category.name}</span>
              <Badge variant="outline">{KIND_BADGES[category.kind]}</Badge>
              {category.archived && <Badge variant="secondary">Archived</Badge>}
            </span>
            <span className="text-muted-foreground text-sm">{category.groupName}</span>
          </div>
        </div>
        {mode === 'view' && (
          <div className="flex flex-wrap gap-1">
            {!category.archived && (
              <>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${category.name} up`}
                  disabled={onMoveUp === undefined || moving}
                  onClick={onMoveUp}
                >
                  <ArrowUp />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${category.name} down`}
                  disabled={onMoveDown === undefined || moving}
                  onClick={onMoveDown}
                >
                  <ArrowDown />
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-label={`Edit ${category.name}`}
              onClick={() => {
                setMode('edit');
              }}
            >
              Edit
            </Button>
            {category.archived ? (
              <Button
                variant="outline"
                size="sm"
                aria-label={`Restore ${category.name}`}
                disabled={restore.isPending}
                onClick={() => {
                  restore.mutate({ id: category.id, patch: { archived: false } });
                }}
              >
                Restore
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                aria-label={`Archive ${category.name}`}
                onClick={() => {
                  setMode('archive');
                }}
              >
                Archive
              </Button>
            )}
          </div>
        )}
      </div>
      {restore.isError && (
        <p role="alert" className="text-destructive text-sm">
          {restore.error.message}
        </p>
      )}
      {mode === 'edit' && <EditCategoryForm category={category} groups={groups} onDone={close} />}
      {mode === 'archive' && (
        <ArchiveCategoryForm category={category} categories={categories} onDone={close} />
      )}
    </li>
  );
}
