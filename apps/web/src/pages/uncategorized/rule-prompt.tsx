import type { Category } from '@funance/shared';
import { useState } from 'react';
import { useApplyRules, useCreateRule, useRules, useRuleTest } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDebouncedValue } from '@/lib/use-debounced-value';
import { draftToInput, EMPTY_DRAFT, nextPriority } from '@/pages/rules/rule-draft';

/** A manual choice the page offers to turn into a rule. */
export type RuleOffer = { pattern: string; category: Category };

type Props = {
  offer: RuleOffer;
  /** Called with a sentence saying what the rule did, or null when declined. */
  onDone: (message: string | null) => void;
};

/**
 * "Always categorize WAL-MART as Groceries?" after a manual choice. Accepting creates a
 * "description contains" rule after every existing one, prefilled from the merchant key and
 * editable, shows how many transactions it matches, and applies the rules.
 */
export function RulePrompt({ offer, onDone }: Props) {
  const [pattern, setPattern] = useState(offer.pattern);
  const rules = useRules();
  const createRule = useCreateRule();
  const applyRules = useApplyRules();
  const priority = nextPriority(rules.data ?? []);
  const draftFor = (text: string) =>
    draftToInput(
      { ...EMPTY_DRAFT, pattern: text.trim(), setCategoryId: String(offer.category.id) },
      priority,
    );
  const input = draftFor(pattern);
  const test = useRuleTest(draftFor(useDebouncedValue(pattern, 300)));
  const pending = createRule.isPending || applyRules.isPending;
  const error = createRule.error ?? applyRules.error;

  async function create() {
    if (input === null) return;
    await createRule.mutateAsync(input);
    const { changed } = await applyRules.mutateAsync();
    onDone(
      `Created the rule “${input.pattern}” → ${offer.category.name}. It categorized ${changed} more ${
        changed === 1 ? 'transaction' : 'transactions'
      }.`,
    );
  }

  return (
    <section
      aria-label="Create a rule"
      className="bg-background sticky top-16 z-[5] flex flex-col gap-2 rounded-md border p-3 shadow-sm"
    >
      <p className="text-sm font-medium" data-testid="rule-question">
        Always categorize {input?.pattern ?? 'this merchant'} as {offer.category.name}?
      </p>
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void create().catch(() => {
            // The error is shown from the mutation state.
          });
        }}
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <Label htmlFor="rule-prompt-pattern" className="text-xs">
            Description contains
          </Label>
          <Input
            id="rule-prompt-pattern"
            value={pattern}
            onChange={(e) => {
              setPattern(e.target.value);
            }}
          />
        </div>
        <Button type="submit" disabled={input === null || rules.data === undefined || pending}>
          Create rule
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onDone(null);
          }}
        >
          Not now
        </Button>
      </form>
      <p className="text-muted-foreground text-xs" data-testid="rule-prompt-matches">
        {test.isError
          ? test.error.message
          : test.data === undefined
            ? 'Checking matches…'
            : `Matches ${test.data.matchCount} ${
                test.data.matchCount === 1 ? 'transaction' : 'transactions'
              }. Categories chosen by hand are never changed.`}
      </p>
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
    </section>
  );
}
