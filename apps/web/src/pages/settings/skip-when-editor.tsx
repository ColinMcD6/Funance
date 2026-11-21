import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SkipWhenDraft } from './account-draft';

type Props = { rules: SkipWhenDraft[]; onChange: (rules: SkipWhenDraft[]) => void };

/** Edits `skipWhen`: a row is skipped when a column is not a value and/or matches a pattern. */
export function SkipWhenEditor({ rules, onChange }: Props) {
  function update(index: number, change: Partial<SkipWhenDraft>) {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...change } : r)));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Skip rows when</legend>
      <p className="text-muted-foreground text-xs">
        A row is skipped when every filled test of a line holds. Patterns ignore case.
      </p>
      {rules.map((rule, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            aria-label={`Skip rule ${index + 1} column`}
            placeholder="Column"
            className="min-w-28 flex-1"
            value={rule.column}
            onChange={(e) => {
              update(index, { column: e.target.value });
            }}
          />
          <Input
            aria-label={`Skip rule ${index + 1} not equal to`}
            placeholder="is not"
            className="min-w-28 flex-1"
            value={rule.notEquals}
            onChange={(e) => {
              update(index, { notEquals: e.target.value });
            }}
          />
          <Input
            aria-label={`Skip rule ${index + 1} matches`}
            placeholder="matches pattern"
            className="min-w-28 flex-1"
            value={rule.matches}
            onChange={(e) => {
              update(index, { matches: e.target.value });
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(rules.filter((_, i) => i !== index));
            }}
          >
            Remove
          </Button>
        </div>
      ))}
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange([...rules, { column: '', notEquals: '', matches: '' }]);
          }}
        >
          Add skip rule
        </Button>
      </div>
    </fieldset>
  );
}
