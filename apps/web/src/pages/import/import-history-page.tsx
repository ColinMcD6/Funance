import { Link } from 'react-router';
import { useAccounts, useImports } from '@/api/queries';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dayOf, IMPORT_STATUS_LABELS } from './import-labels';
import { UndoImport } from './undo-import';

/** Every committed or undone import, newest first, with its counts and an Undo button. */
export function ImportHistoryPage() {
  const imports = useImports();
  const accounts = useAccounts();
  const accountName = (id: number | null) =>
    id === null ? 'None' : (accounts.data?.find((a) => a.id === id)?.name ?? `Account ${id}`);
  // Previews that were never committed are not history; the server deletes them after a day.
  const rows = imports.data?.filter((i) => i.status !== 'preview') ?? [];

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Import history</h1>
        <Button asChild size="sm">
          <Link to="/import">Import a file</Link>
        </Button>
      </div>
      {imports.isError && (
        <p role="alert" className="text-destructive text-sm">
          {imports.error.message}
        </p>
      )}
      {imports.isSuccess && rows.length === 0 && (
        <p className="text-muted-foreground">Nothing has been imported yet.</p>
      )}
      {rows.length > 0 && (
        <ul className="flex flex-col divide-y rounded-md border">
          {rows.map((summary) => (
            <li
              key={summary.id}
              data-testid="import-row"
              className="flex flex-wrap items-center justify-between gap-2 p-3"
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  <Link to={`/import/${summary.id}`} className="break-all hover:underline">
                    {summary.filename}
                  </Link>
                  <Badge variant={summary.status === 'committed' ? 'default' : 'secondary'}>
                    {IMPORT_STATUS_LABELS[summary.status]}
                  </Badge>
                </span>
                <span className="text-muted-foreground text-sm">
                  #{summary.id} · {accountName(summary.accountId)} ·{' '}
                  {dayOf(summary.committedAt ?? summary.createdAt)}
                  {summary.undoneAt !== null && ` · undone ${dayOf(summary.undoneAt)}`}
                </span>
                <span className="text-muted-foreground text-sm">
                  {summary.insertedCount} added · {summary.duplicateCount} duplicate ·{' '}
                  {summary.skippedCount} skipped · {summary.errorCount} error
                </span>
              </div>
              {summary.status === 'committed' && <UndoImport summary={summary} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
