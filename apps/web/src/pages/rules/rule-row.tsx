import type { Rule } from '@funance/shared';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { useState } from 'react';
import { useDeleteRule, useUpdateRule } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { categoryName, describeCondition, describeLimits, type RuleLookups } from './rule-draft';
import { RuleForm } from './rule-form';

type Props = {
  rule: Rule;
  lookups: RuleLookups;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  moving: boolean;
};

/** One rule: what it matches and sets, an enabled switch, reorder, Edit and Delete. */
export function RuleRow({ rule, lookups, onMoveUp, onMoveDown, moving }: Props) {
  const [mode, setMode] = useState<'view' | 'edit' | 'delete'>('view');
  const update = useUpdateRule();
  const remove = useDeleteRule();
  const condition = describeCondition(rule);
  const limits = describeLimits(rule, lookups);
  const error = update.error ?? remove.error;

  if (mode === 'edit') {
    return (
      <li className="p-3">
        <RuleForm
          rule={rule}
          priority={rule.priority}
          lookups={lookups}
          onDone={() => {
            setMode('view');
          }}
        />
      </li>
    );
  }

  return (
    <li data-testid="rule-row" className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <span className="flex flex-wrap items-center gap-x-2 font-medium">
            <span className="break-words">{condition}</span>
            <span aria-hidden>→</span>
            <span>{categoryName(lookups, rule.setCategoryId)}</span>
            {!rule.enabled && <Badge variant="secondary">Disabled</Badge>}
          </span>
          {limits.length > 0 && (
            <span className="text-muted-foreground text-sm">{limits.join(' · ')}</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <label className="mr-2 flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              className="size-4"
              aria-label={`Enable rule ${condition}`}
              checked={rule.enabled}
              disabled={update.isPending}
              onChange={(e) => {
                update.mutate({ id: rule.id, patch: { enabled: e.target.checked } });
              }}
            />
            Enabled
          </label>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move rule ${condition} up`}
            disabled={onMoveUp === undefined || moving}
            onClick={onMoveUp}
          >
            <ArrowUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Move rule ${condition} down`}
            disabled={onMoveDown === undefined || moving}
            onClick={onMoveDown}
          >
            <ArrowDown />
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Edit rule ${condition}`}
            onClick={() => {
              setMode('edit');
            }}
          >
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label={`Delete rule ${condition}`}
            onClick={() => {
              setMode('delete');
            }}
          >
            Delete
          </Button>
        </div>
      </div>
      {mode === 'delete' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Delete this rule? Transactions it categorized keep their category.</span>
          <Button
            size="sm"
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(rule.id);
            }}
          >
            Delete rule
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setMode('view');
            }}
          >
            Cancel
          </Button>
        </div>
      )}
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
    </li>
  );
}
