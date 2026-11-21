import { Link } from 'react-router';
import { useAccounts, useOwners, useUpdateAccount } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const TYPE_LABELS = { chequing: 'Chequing', savings: 'Savings', credit_card: 'Credit card' };

/** Settings section: every account with Edit and Archive or Restore. */
export function AccountList() {
  const accounts = useAccounts();
  const owners = useOwners();
  const update = useUpdateAccount();
  const ownerName = (id: number) => owners.data?.find((o) => o.id === id)?.name ?? '…';

  return (
    <section aria-labelledby="accounts-heading" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="accounts-heading" className="text-lg font-semibold">
          Accounts
        </h2>
        <Button asChild>
          <Link to="/settings/accounts/new">Add account</Link>
        </Button>
      </div>
      {accounts.isError && (
        <p role="alert" className="text-destructive text-sm">
          {accounts.error.message}
        </p>
      )}
      {update.isError && (
        <p role="alert" className="text-destructive text-sm">
          {update.error.message}
        </p>
      )}
      <ul className="flex flex-col divide-y rounded-md border">
        {accounts.data?.map((account) => (
          <li
            key={account.id}
            data-testid="account-row"
            className="flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <div className="flex min-w-0 flex-col">
              <span className="flex items-center gap-2 font-medium">
                <span className="truncate">{account.name}</span>
                {account.archived && <Badge variant="secondary">Archived</Badge>}
              </span>
              <span className="text-muted-foreground text-sm">
                {TYPE_LABELS[account.type]} · default owner {ownerName(account.defaultOwnerId)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to={`/settings/accounts/${account.id}`} aria-label={`Edit ${account.name}`}>
                  Edit
                </Link>
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={update.isPending}
                aria-label={`${account.archived ? 'Restore' : 'Archive'} ${account.name}`}
                onClick={() => {
                  update.mutate({ id: account.id, patch: { archived: !account.archived } });
                }}
              >
                {account.archived ? 'Restore' : 'Archive'}
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
