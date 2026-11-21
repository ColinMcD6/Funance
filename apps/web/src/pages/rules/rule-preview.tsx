import type { RuleInput } from '@funance/shared';
import { useRuleTest } from '@/api/queries';
import { AmountText } from '@/pages/transactions/amount-text';

/** Live match count and up to ten sample transactions for an unsaved rule. */
export function RulePreview({ input }: { input: RuleInput | null }) {
  const test = useRuleTest(input);

  if (input === null) {
    return (
      <p className="text-muted-foreground text-sm">
        Type a pattern to see which transactions it matches.
      </p>
    );
  }
  if (test.isError) {
    return (
      <p role="alert" className="text-destructive text-sm">
        {test.error.message}
      </p>
    );
  }
  if (test.data === undefined) {
    return <p className="text-muted-foreground text-sm">Checking matches…</p>;
  }
  const { matchCount, samples } = test.data;
  return (
    <section aria-label="Match preview" className="flex flex-col gap-2" aria-busy={test.isFetching}>
      <p className="text-sm font-medium" data-testid="rule-match-count">
        Matches {matchCount} {matchCount === 1 ? 'transaction' : 'transactions'}
      </p>
      {samples.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {samples.map((t) => (
            <li
              key={t.id}
              data-testid="rule-sample"
              className="flex items-center justify-between gap-3 px-3 py-1.5"
            >
              <span className="text-muted-foreground shrink-0 tabular-nums">{t.date}</span>
              <span className="min-w-0 flex-1 truncate">{t.description}</span>
              <AmountText cents={t.amountCents} />
            </li>
          ))}
        </ul>
      )}
      {matchCount > samples.length && (
        <p className="text-muted-foreground text-xs">Showing the newest {samples.length}.</p>
      )}
    </section>
  );
}
