import type { Budget, Category, Owner } from '@funance/shared';
import { useState } from 'react';
import { usePutBudgets } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { localToday, monthLabel } from '@/pages/reports/report-view';
import {
  budgetableCategories,
  draftToBudgets,
  newDraftRow,
  rowsInEffect,
  sortDraft,
  toDraft,
  type DraftRow,
} from './budget-draft';
import { BudgetRow } from './budget-row';

type Props = {
  saved: readonly Budget[];
  categories: readonly Category[];
  owners: readonly Owner[];
};

/** The draft list of budget rows with add, remove, save and discard. */
export function BudgetEditor({ saved, categories, owners }: Props) {
  const put = usePutBudgets();
  const ownerOrder = owners.map((o) => o.id);
  const initial = () => sortDraft(toDraft(saved), categories, ownerOrder);
  const [rows, setRows] = useState<DraftRow[]>(initial);
  const [problem, setProblem] = useState<{ key: string; message: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const thisMonth = localToday().slice(0, 7);
  const inEffect = rowsInEffect(rows, thisMonth);
  const choices = budgetableCategories(categories);
  const selectable = categories.filter((c) => c.kind !== 'transfer');

  const update = (next: DraftRow[]) => {
    setRows(next);
    setDirty(true);
    setProblem(null);
    put.reset();
  };

  const save = () => {
    const result = draftToBudgets(rows);
    if (!result.ok) {
      setProblem({ key: result.key, message: result.message });
      return;
    }
    put.mutate(result.budgets, {
      onSuccess: (stored) => {
        setRows(sortDraft(toDraft(stored), categories, ownerOrder));
        setDirty(false);
      },
    });
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Budget rows">
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">No budgets yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <BudgetRow
              key={row.key}
              row={row}
              categories={selectable}
              owners={owners}
              inEffect={inEffect.has(row.key)}
              error={problem?.key === row.key ? problem.message : null}
              onChange={(changed) => {
                update(rows.map((r) => (r.key === row.key ? changed : r)));
              }}
              onRemove={() => {
                update(rows.filter((r) => r.key !== row.key));
              }}
            />
          ))}
        </ul>
      )}
      <p className="text-muted-foreground text-xs">
        &ldquo;In effect&rdquo; marks the budgets that apply in {monthLabel(thisMonth)}.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={choices.length === 0}
          onClick={() => {
            const first = choices[0];
            if (first !== undefined) update([...rows, newDraftRow(first.id, thisMonth)]);
          }}
        >
          Add budget
        </Button>
        <Button type="button" disabled={!dirty || put.isPending} onClick={save}>
          {put.isPending ? 'Saving…' : 'Save budgets'}
        </Button>
        {dirty && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setRows(initial());
              setDirty(false);
              setProblem(null);
            }}
          >
            Discard changes
          </Button>
        )}
        {!dirty && put.isSuccess && (
          <span role="status" className="text-sm text-green-700">
            Budgets saved.
          </span>
        )}
      </div>
      {put.isError && (
        <p role="alert" className="text-destructive text-sm">
          {put.error.message}
        </p>
      )}
    </section>
  );
}
