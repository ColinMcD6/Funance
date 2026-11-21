import { useOwners } from '@/api/queries';
import { OwnerNameRow } from './owner-name-row';

/** Settings section: rename the three owners. */
export function OwnerNames() {
  const owners = useOwners();
  return (
    <section aria-labelledby="owners-heading" className="flex flex-col gap-3">
      <h2 id="owners-heading" className="text-lg font-semibold">
        Owners
      </h2>
      <p className="text-muted-foreground text-sm">
        The two people are also the profiles. Joint is for shared spending.
      </p>
      {owners.isError && (
        <p role="alert" className="text-destructive text-sm">
          {owners.error.message}
        </p>
      )}
      <div className="flex max-w-md flex-col gap-2">
        {owners.data?.map((owner) => (
          // Keyed by name too, so a saved rename resets the row's draft.
          <OwnerNameRow key={`${owner.id}-${owner.name}`} owner={owner} />
        ))}
      </div>
    </section>
  );
}
