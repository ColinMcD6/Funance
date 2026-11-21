import type { TransactionQuery } from '@funance/shared';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CategorySelect } from './category-select';
import type { Lookups } from './lookups';
import { SearchForm } from './search-form';
import { SortSelect } from './sort-select';

type Props = {
  query: TransactionQuery;
  lookups: Lookups;
  onChange: (change: Partial<TransactionQuery>) => void;
  onClear: (() => void) | null;
};

const EXCLUDED_OPTIONS = [
  { value: '', label: 'All rows' },
  { value: 'false', label: 'Included only' },
  { value: 'true', label: 'Excluded only' },
] as const;

/**
 * Owner, account, category, date range, amount range and search. Selects and dates apply at
 * once; the search and amount fields apply on Enter or with the Apply button.
 */
export function FilterBar({ query, lookups, onChange, onClear }: Props) {
  const idOrNone = (value: string) =>
    value === '' ? undefined : value === 'none' ? ('none' as const) : Number(value);
  return (
    <section aria-label="Filters" className="flex flex-col gap-3">
      <SearchForm
        key={`${query.q ?? ''}|${String(query.minCents)}|${String(query.maxCents)}`}
        query={query}
        onChange={onChange}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <FormField label="Owner">
          {(id) => (
            <NativeSelect
              id={id}
              value={query.owner ?? ''}
              onChange={(e) => {
                onChange({ owner: e.target.value === '' ? undefined : Number(e.target.value) });
              }}
            >
              <option value="">Everyone</option>
              {lookups.owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Account">
          {(id) => (
            <NativeSelect
              id={id}
              value={query.account ?? ''}
              onChange={(e) => {
                onChange({ account: idOrNone(e.target.value) });
              }}
            >
              <option value="">All accounts</option>
              {lookups.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.archived ? ' (archived)' : ''}
                </option>
              ))}
              <option value="none">None (legacy)</option>
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Category">
          {(id) => (
            <CategorySelect
              id={id}
              categories={lookups.categories}
              leading={[
                { value: '', label: 'All categories' },
                { value: 'none', label: 'Uncategorized' },
              ]}
              value={query.category === undefined ? '' : String(query.category)}
              onChange={(e) => {
                onChange({ category: idOrNone(e.target.value) });
              }}
            />
          )}
        </FormField>
        <FormField label="From">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={query.from ?? ''}
              max={query.to}
              onChange={(e) => {
                onChange({ from: e.target.value === '' ? undefined : e.target.value });
              }}
            />
          )}
        </FormField>
        <FormField label="To">
          {(id) => (
            <Input
              id={id}
              type="date"
              value={query.to ?? ''}
              min={query.from}
              onChange={(e) => {
                onChange({ to: e.target.value === '' ? undefined : e.target.value });
              }}
            />
          )}
        </FormField>
        <FormField label="Show">
          {(id) => (
            <NativeSelect
              id={id}
              value={query.excluded === undefined ? '' : String(query.excluded)}
              onChange={(e) => {
                const value = e.target.value;
                onChange({ excluded: value === '' ? undefined : value === 'true' });
              }}
            >
              {EXCLUDED_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SortSelect query={query} onChange={onChange} />
        {onClear !== null && (
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>
            Clear filters
          </Button>
        )}
      </div>
    </section>
  );
}
