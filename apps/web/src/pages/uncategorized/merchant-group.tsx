import { Button } from '@/components/ui/button';
import { CategorySelect } from '@/pages/transactions/category-select';
import type { EditTransaction, Lookups } from '@/pages/transactions/lookups';
import type { MerchantGroup as Group } from './queue';
import { QueueRow } from './queue-row';

type Props = {
  group: Group;
  lookups: Lookups;
  activeId: number | null;
  onActivate: (id: number) => void;
  /** Accepts each listed row's own suggestion. */
  onAccept: (ids: readonly number[], categoryId: number) => void;
  /** A manual choice for the listed rows. */
  onPick: (ids: readonly number[], categoryId: number) => void;
  onEdit: EditTransaction;
};

/** The queue rows of one merchant key, with whole-group accept and pick when there are several. */
export function MerchantGroup({
  group,
  lookups,
  activeId,
  onActivate,
  onAccept,
  onPick,
  onEdit,
}: Props) {
  const ids = group.items.map((t) => t.id);
  const several = ids.length > 1;
  const shared =
    group.sharedSuggestionId === null
      ? undefined
      : lookups.categories.find((c) => c.id === group.sharedSuggestionId);
  return (
    <section
      aria-label={group.merchantKey}
      data-testid="merchant-group"
      className="overflow-hidden rounded-md border"
    >
      <header className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <h2 className="min-w-0 text-sm font-semibold break-words">
          {group.merchantKey}
          <span className="text-muted-foreground font-normal">
            {' '}
            · {ids.length} {several ? 'transactions' : 'transaction'}
          </span>
        </h2>
        {several && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {shared !== undefined && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  onAccept(ids, shared.id);
                }}
              >
                Accept {shared.name} for all {ids.length}
              </Button>
            )}
            <CategorySelect
              aria-label={`Category for all ${group.merchantKey}`}
              className="h-8 sm:w-48"
              categories={lookups.categories}
              leading={[{ value: '', label: 'Set all to…' }]}
              value=""
              onChange={(e) => {
                if (e.target.value !== '') onPick(ids, Number(e.target.value));
              }}
            />
          </div>
        )}
      </header>
      <ul className="divide-y">
        {group.items.map((item) => (
          <QueueRow
            key={item.id}
            item={item}
            lookups={lookups}
            active={item.id === activeId}
            onActivate={() => {
              onActivate(item.id);
            }}
            onAccept={() => {
              if (item.suggestedCategoryId != null) onAccept([item.id], item.suggestedCategoryId);
            }}
            onPick={(categoryId) => {
              onPick([item.id], categoryId);
            }}
            onEdit={onEdit}
          />
        ))}
      </ul>
    </section>
  );
}
