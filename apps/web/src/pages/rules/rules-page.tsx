import { useState } from 'react';
import {
  useAccounts,
  useApplyRules,
  useCategories,
  useOwners,
  useRules,
  useUpdateRule,
} from '@/api/queries';
import { Button } from '@/components/ui/button';
import { moveOrder } from '@/lib/reorder';
import { nextPriority, type RuleLookups } from './rule-draft';
import { RuleForm } from './rule-form';
import { RuleRow } from './rule-row';

/** Rules: list by priority, create and edit with a live preview, reorder, enable, apply now. */
export function RulesPage() {
  const rules = useRules();
  const categories = useCategories();
  const accounts = useAccounts();
  const owners = useOwners();
  const update = useUpdateRule();
  const apply = useApplyRules();
  const [creating, setCreating] = useState(false);
  const [moving, setMoving] = useState(false);
  const [moveError, setMoveError] = useState<string | null>(null);

  const list = rules.data ?? [];
  const lookups: RuleLookups = {
    categories: categories.data ?? [],
    accounts: accounts.data ?? [],
    owners: owners.data ?? [],
  };
  const loadError = rules.error ?? categories.error ?? accounts.error ?? owners.error;

  const move = async (index: number, delta: -1 | 1) => {
    const patches = moveOrder(
      list.map((r) => ({ id: r.id, order: r.priority })),
      index,
      delta,
    );
    setMoving(true);
    setMoveError(null);
    try {
      for (const { id, order } of patches) {
        await update.mutateAsync({ id, patch: { priority: order } });
      }
    } catch (error) {
      setMoveError(error instanceof Error ? error.message : 'Could not move the rule');
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Rules</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={apply.isPending}
            onClick={() => {
              apply.mutate();
            }}
          >
            Apply rules now
          </Button>
          {!creating && (
            <Button
              onClick={() => {
                setCreating(true);
              }}
            >
              New rule
            </Button>
          )}
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Rules run in this order when a statement is imported, and when you apply them. The first
        rule that matches sets the category. Categories you set by hand are never changed.
      </p>
      {apply.isSuccess && (
        <p role="status" className="text-sm" data-testid="apply-result">
          Rules changed {apply.data.changed}{' '}
          {apply.data.changed === 1 ? 'transaction' : 'transactions'}.
        </p>
      )}
      {apply.isError && (
        <p role="alert" className="text-destructive text-sm">
          {apply.error.message}
        </p>
      )}
      {creating && (
        <RuleForm
          priority={nextPriority(list)}
          lookups={lookups}
          onDone={() => {
            setCreating(false);
          }}
        />
      )}
      {loadError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {loadError.message}
        </p>
      )}
      {moveError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {moveError}
        </p>
      )}
      {rules.isSuccess && list.length === 0 && (
        <p className="text-muted-foreground">No rules yet.</p>
      )}
      <ol aria-label="Rules" className="flex flex-col divide-y rounded-md border empty:hidden">
        {list.map((rule, index) => (
          <RuleRow
            key={rule.id}
            rule={rule}
            lookups={lookups}
            moving={moving}
            onMoveUp={
              index > 0
                ? () => {
                    void move(index, -1);
                  }
                : undefined
            }
            onMoveDown={
              index < list.length - 1
                ? () => {
                    void move(index, 1);
                  }
                : undefined
            }
          />
        ))}
      </ol>
    </div>
  );
}
