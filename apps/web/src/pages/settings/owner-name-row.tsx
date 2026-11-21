import type { Owner } from '@funance/shared';
import { useState } from 'react';
import { useRenameOwner } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** One owner's name with a Save button. */
export function OwnerNameRow({ owner }: { owner: Owner }) {
  const [name, setName] = useState(owner.name);
  const rename = useRenameOwner();
  const changed = name.trim() !== owner.name && name.trim() !== '';

  return (
    <form
      className="flex flex-col gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (changed) rename.mutate({ id: owner.id, name: name.trim() });
      }}
    >
      <div className="flex items-center gap-2">
        <Input
          aria-label={`Name of ${owner.name} (${owner.kind})`}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          maxLength={100}
        />
        <Button type="submit" variant="outline" disabled={!changed || rename.isPending}>
          Save
        </Button>
      </div>
      {rename.isError && (
        <p role="alert" className="text-destructive text-sm">
          {rename.error.message}
        </p>
      )}
    </form>
  );
}
