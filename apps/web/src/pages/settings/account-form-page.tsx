import { Link, useNavigate, useParams } from 'react-router';
import {
  useAccounts,
  useCreateAccount,
  useCsvPresets,
  useOwners,
  useUpdateAccount,
} from '@/api/queries';
import { AccountForm } from './account-form';
import { draftFromAccount, emptyDraft } from './account-draft';

/** /settings/accounts/new and /settings/accounts/:id */
export function AccountFormPage() {
  const { id } = useParams();
  const accountId = id === undefined ? undefined : Number(id);
  const navigate = useNavigate();
  const accounts = useAccounts();
  const owners = useOwners();
  const presets = useCsvPresets();
  const create = useCreateAccount();
  const update = useUpdateAccount();

  const account =
    accountId === undefined ? undefined : accounts.data?.find((a) => a.id === accountId);
  const title = accountId === undefined ? 'Add account' : `Edit ${account?.name ?? 'account'}`;
  const loadError = accounts.error ?? owners.error ?? presets.error;
  const ready =
    owners.data !== undefined &&
    presets.data !== undefined &&
    (accountId === undefined || accounts.data !== undefined);
  const mutation = accountId === undefined ? create : update;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Link to="/settings" className="text-muted-foreground text-sm hover:underline">
        ← Settings
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {loadError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {loadError.message}
        </p>
      )}
      {ready && accountId !== undefined && account === undefined && (
        <p role="alert">No account with id {id}.</p>
      )}
      {ready && (accountId === undefined || account !== undefined) && (
        <AccountForm
          key={account?.id ?? 'new'}
          initial={account === undefined ? emptyDraft() : draftFromAccount(account)}
          owners={owners.data}
          presets={presets.data}
          submitLabel={accountId === undefined ? 'Create account' : 'Save account'}
          pending={mutation.isPending}
          serverError={mutation.error?.message}
          onSubmit={(request) => {
            const done = () => void navigate('/settings');
            if (accountId === undefined) create.mutate(request, { onSuccess: done });
            else update.mutate({ id: accountId, patch: request }, { onSuccess: done });
          }}
        />
      )}
    </div>
  );
}
