import {
  RULE_MATCH_FIELDS,
  RULE_MATCH_TYPES,
  type Direction,
  type Rule,
  type RuleMatchField,
  type RuleMatchType,
} from '@funance/shared';
import { useState } from 'react';
import { useCreateRule, useUpdateRule } from '@/api/queries';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { CategorySelect } from '@/pages/transactions/category-select';
import {
  EMPTY_DRAFT,
  FIELD_LABELS,
  TYPE_LABELS,
  draftFromRule,
  draftToInput,
  type RuleDraft,
  type RuleLookups,
} from './rule-draft';
import { RulePreview } from './rule-preview';

type Props = {
  /** The rule being edited; absent for a new rule. */
  rule?: Rule;
  /** Where a new rule goes; an edited rule keeps its own priority. */
  priority: number;
  lookups: RuleLookups;
  onDone: () => void;
};

/** Creates or edits a rule, previewing its matches as you type. */
export function RuleForm({ rule, priority, lookups, onDone }: Props) {
  const [draft, setDraft] = useState<RuleDraft>(
    rule === undefined ? EMPTY_DRAFT : draftFromRule(rule),
  );
  const create = useCreateRule();
  const update = useUpdateRule();
  const save = rule === undefined ? create : update;
  const set = (patch: Partial<RuleDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
  };

  const rulePriority = rule?.priority ?? priority;
  const input = draftToInput(draft, rulePriority);
  // The preview needs some category id; it does not depend on which.
  const anyCategory = lookups.categories.find((c) => !c.archived)?.id;
  const previewInput = draftToInput(useDebouncedValue(draft, 300), rulePriority, anyCategory);
  const title = rule === undefined ? 'New rule' : 'Edit rule';

  return (
    <form
      aria-label={title}
      className="flex flex-col gap-4 rounded-md border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (input === null) return;
        if (rule === undefined) create.mutate(input, { onSuccess: onDone });
        else update.mutate({ id: rule.id, patch: input }, { onSuccess: onDone });
      }}
    >
      <h2 className="font-semibold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <FormField label="Field">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.matchField}
              onChange={(e) => {
                set({ matchField: e.target.value as RuleMatchField });
              }}
            >
              {RULE_MATCH_FIELDS.map((field) => (
                <option key={field} value={field}>
                  {FIELD_LABELS[field]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Match">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.matchType}
              onChange={(e) => {
                set({ matchType: e.target.value as RuleMatchType });
              }}
            >
              {RULE_MATCH_TYPES.map((type) => (
                <option key={type} value={type}>
                  {TYPE_LABELS[type]}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Pattern" hint="Not case-sensitive.">
          {(id) => (
            <Input
              id={id}
              value={draft.pattern}
              required
              autoComplete="off"
              onChange={(e) => {
                set({ pattern: e.target.value });
              }}
            />
          )}
        </FormField>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Set category">
          {(id) => (
            <CategorySelect
              id={id}
              categories={lookups.categories}
              leading={[{ value: '', label: 'Choose a category' }]}
              value={draft.setCategoryId}
              required
              onChange={(e) => {
                set({ setCategoryId: e.target.value });
              }}
            />
          )}
        </FormField>
        <FormField label="Also set owner">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.setOwnerId}
              onChange={(e) => {
                set({ setOwnerId: e.target.value });
              }}
            >
              <option value="">Keep the owner</option>
              {lookups.owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Only for account">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.accountId}
              onChange={(e) => {
                set({ accountId: e.target.value });
              }}
            >
              <option value="">Any account</option>
              {lookups.accounts
                .filter((a) => !a.archived || String(a.id) === draft.accountId)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </NativeSelect>
          )}
        </FormField>
        <FormField label="Direction">
          {(id) => (
            <NativeSelect
              id={id}
              value={draft.direction}
              onChange={(e) => {
                set({ direction: e.target.value as '' | Direction });
              }}
            >
              <option value="">Money in and out</option>
              <option value="outflow">Money out only</option>
              <option value="inflow">Money in only</option>
            </NativeSelect>
          )}
        </FormField>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={draft.enabled}
          onChange={(e) => {
            set({ enabled: e.target.checked });
          }}
        />
        Enabled
      </label>
      <RulePreview input={previewInput} />
      {save.isError && (
        <p role="alert" className="text-destructive text-sm">
          {save.error.message}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={input === null || save.isPending}>
          {rule === undefined ? 'Create rule' : 'Save rule'}
        </Button>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
