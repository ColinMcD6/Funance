import type { TransactionQuery } from '@funance/shared';
import { useState } from 'react';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { centsToDollarText, parseDollars } from './dollars';

type Props = {
  query: TransactionQuery;
  onChange: (change: Partial<TransactionQuery>) => void;
};

/**
 * Search text and the amount range, applied together on Enter or Apply. Amounts are signed
 * dollars, as stored: spending is negative, so "-100" to "-20" finds purchases of $20 to $100.
 */
export function SearchForm({ query, onChange }: Props) {
  const [q, setQ] = useState(query.q ?? '');
  const [min, setMin] = useState(centsToDollarText(query.minCents));
  const [max, setMax] = useState(centsToDollarText(query.maxCents));
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      role="search"
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const minCents = parseDollars(min);
        const maxCents = parseDollars(max);
        if (minCents === null || maxCents === null) {
          setError('Amounts must be numbers like -45.10 or 1200.');
          return;
        }
        setError(null);
        const text = q.trim();
        onChange({ q: text === '' ? undefined : text, minCents, maxCents });
      }}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_8rem_8rem_auto] sm:items-end">
        <div className="col-span-2 sm:col-span-1">
          <FormField label="Search">
            {(id) => (
              <Input
                id={id}
                type="search"
                placeholder="Description, memo or note"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                }}
              />
            )}
          </FormField>
        </div>
        <FormField label="Min amount">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              placeholder="-100.00"
              value={min}
              aria-invalid={error !== null && parseDollars(min) === null}
              onChange={(e) => {
                setMin(e.target.value);
              }}
            />
          )}
        </FormField>
        <FormField label="Max amount">
          {(id) => (
            <Input
              id={id}
              inputMode="decimal"
              placeholder="0.00"
              value={max}
              aria-invalid={error !== null && parseDollars(max) === null}
              onChange={(e) => {
                setMax(e.target.value);
              }}
            />
          )}
        </FormField>
        <div className="col-span-2 sm:col-span-1">
          <Button type="submit" variant="secondary">
            Apply
          </Button>
        </div>
      </div>
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
    </form>
  );
}
