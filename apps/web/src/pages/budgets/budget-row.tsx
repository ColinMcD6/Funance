import type { Category, Owner } from '@funance/shared';
import { NativeSelect } from '@/components/native-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { DraftRow } from './budget-draft';

type Props = {
  row: DraftRow;
  categories: readonly Category[];
  owners: readonly Owner[];
  inEffect: boolean;
  error: string | null;
  onChange: (row: DraftRow) => void;
  onRemove: () => void;
};

/** One budget row of the Budgets page: category, who, start month, monthly amount. */
export function BudgetRow({ row, categories, owners, inEffect, error, onChange, onRemove }: Props) {
  const categoryName = categories.find((c) => c.id === row.categoryId)?.name ?? 'budget';
  // An archived category keeps its rows; it stays selectable on the rows that already use it.
  const choices = categories.filter((c) => !c.archived || c.id === row.categoryId);
  return (
    <li
      className="grid grid-cols-2 items-end gap-2 border-b pb-3 md:grid-cols-[2fr_1.2fr_1.2fr_1fr_auto]"
      data-testid="budget-row"
    >
      <label className="col-span-2 flex min-w-0 flex-col gap-1 text-xs md:col-span-1">
        <span className="text-muted-foreground flex items-center gap-2">
          Category
          {inEffect && <Badge variant="secondary">In effect</Badge>}
        </span>
        <NativeSelect
          aria-label="Category"
          value={row.categoryId}
          onChange={(e) => {
            onChange({ ...row, categoryId: Number(e.target.value) });
          }}
        >
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.archived ? ' (archived)' : ''}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">For</span>
        <NativeSelect
          aria-label="For"
          value={row.ownerId ?? ''}
          onChange={(e) => {
            onChange({ ...row, ownerId: e.target.value === '' ? null : Number(e.target.value) });
          }}
        >
          <option value="">Household</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">From</span>
        <Input
          type="month"
          aria-label="From"
          value={row.effectiveFrom}
          onChange={(e) => {
            onChange({ ...row, effectiveFrom: e.target.value });
          }}
        />
      </label>
      <label className="flex min-w-0 flex-col gap-1 text-xs">
        <span className="text-muted-foreground">Monthly amount ($)</span>
        <Input
          inputMode="decimal"
          aria-label="Monthly amount"
          aria-invalid={error !== null}
          value={row.amount}
          placeholder="0.00"
          onChange={(e) => {
            onChange({ ...row, amount: e.target.value });
          }}
        />
      </label>
      <Button
        type="button"
        variant="outline"
        aria-label={`Remove ${categoryName} budget`}
        onClick={onRemove}
      >
        Remove
      </Button>
      {error !== null && (
        <p role="alert" className="text-destructive col-span-full text-sm">
          {error}
        </p>
      )}
    </li>
  );
}
