import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiRequestError } from '@/api/client';
import { useAccounts, useCommitImport, usePreviewImport } from '@/api/queries';
import { FormField } from '@/components/form-field';
import { NativeSelect } from '@/components/native-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ImportPreview } from './import-preview';

/** Import: pick an account and a statement file, preview the parsed rows, then commit. */
export function ImportPage() {
  const accounts = useAccounts();
  const preview = usePreviewImport();
  const commit = useCommitImport();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const active = accounts.data?.filter((a) => !a.archived) ?? [];
  const chosenAccount = active.find((a) => String(a.id) === accountId);
  const previewAccount = accounts.data?.find((a) => a.id === preview.data?.import.accountId);

  function submit() {
    if (chosenAccount === undefined || file === null) return;
    commit.reset();
    preview.mutate({ accountId: chosenAccount.id, file });
  }

  function cancel() {
    preview.reset();
    commit.reset();
    setFile(null);
    if (fileInput.current !== null) fileInput.current.value = '';
  }

  const previewError = preview.error;
  const mappingProblem =
    previewError instanceof ApiRequestError && previewError.code === 'missing_columns';

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Import</h1>
        <Button asChild variant="outline" size="sm">
          <Link to="/import/history">Import history</Link>
        </Button>
      </div>

      {preview.data === undefined ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="flex max-w-xl flex-col gap-4"
          aria-label="Choose a file"
        >
          <FormField label="Account">
            {(id) => (
              <NativeSelect
                id={id}
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                }}
              >
                <option value="">Choose an account…</option>
                {active.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </NativeSelect>
            )}
          </FormField>
          <FormField label="Statement file" hint="The CSV file downloaded from the bank.">
            {(id) => (
              <Input
                id={id}
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
            )}
          </FormField>
          {previewError !== null && (
            <div role="alert" className="text-destructive flex flex-col gap-1 text-sm">
              <p>{previewError.message}</p>
              {mappingProblem && chosenAccount !== undefined && (
                <Link to={`/settings/accounts/${chosenAccount.id}`} className="underline">
                  Edit the {chosenAccount.name} mapping
                </Link>
              )}
            </div>
          )}
          <div>
            <Button
              type="submit"
              disabled={chosenAccount === undefined || file === null || preview.isPending}
            >
              {preview.isPending ? 'Reading file…' : 'Preview'}
            </Button>
          </div>
        </form>
      ) : (
        <ImportPreview
          preview={preview.data}
          accountName={previewAccount?.name ?? ''}
          committing={commit.isPending}
          commitError={commit.error?.message ?? null}
          onCancel={cancel}
          onCommit={() => {
            commit.mutate(
              { id: preview.data.import.id, body: {} },
              {
                onSuccess: (summary) => {
                  void navigate(`/import/${summary.id}`);
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}
