import type { Owner } from '@funance/shared';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { OwnerHintDraft } from './account-draft';

type Props = {
  hints: OwnerHintDraft[];
  owners: Owner[];
  onChange: (hints: OwnerHintDraft[]) => void;
};

/** Edits the owner-hint value map: a column value (such as a cardholder name) to an owner. */
export function OwnerHintEditor({ hints, owners, onChange }: Props) {
  function update(index: number, change: Partial<OwnerHintDraft>) {
    onChange(hints.map((h, i) => (i === index ? { ...h, ...change } : h)));
  }

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium">Owner hints</legend>
      <p className="text-muted-foreground text-xs">
        Rows whose owner-hint column holds this value get this owner instead of the default.
        Matching ignores case.
      </p>
      {hints.map((hint, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2" data-testid="owner-hint-row">
          <Input
            aria-label={`Owner hint ${index + 1} value`}
            className="min-w-40 flex-1"
            value={hint.value}
            onChange={(e) => {
              update(index, { value: e.target.value });
            }}
          />
          <NativeSelect
            aria-label={`Owner hint ${index + 1} owner`}
            className="w-36"
            value={hint.ownerId}
            onChange={(e) => {
              update(index, { ownerId: e.target.value });
            }}
          >
            <option value="">Owner…</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </NativeSelect>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(hints.filter((_, i) => i !== index));
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
            onChange([...hints, { value: '', ownerId: '' }]);
          }}
        >
          Add owner hint
        </Button>
      </div>
    </fieldset>
  );
}
