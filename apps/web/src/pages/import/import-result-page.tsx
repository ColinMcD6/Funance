import { Link, useParams } from 'react-router';
import { useAccounts, useImport } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { IMPORT_STATUS_LABELS, plural } from './import-labels';

/** The result of one import: what was added and where to go next. */
export function ImportResultPage() {
  const id = Number(useParams().id);
  const valid = Number.isInteger(id) && id > 0;
  const detail = useImport(id, { enabled: valid });
  const accounts = useAccounts();

  if (!valid || detail.isError) {
    return (
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Import not found</h1>
        <Link to="/import/history" className="underline">
          Import history
        </Link>
      </section>
    );
  }
  const summary = detail.data?.import;
  if (summary === undefined) {
    return <h1 className="text-2xl font-semibold">Import</h1>;
  }
  const accountName = accounts.data?.find((a) => a.id === summary.accountId)?.name ?? 'None';
  const counts: [string, number][] = [
    ['Added', summary.insertedCount],
    ['Duplicates left out', summary.duplicateCount],
    ['Skipped', summary.skippedCount],
    ['Errors', summary.errorCount],
  ];

  return (
    <section className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">
          {summary.status === 'committed'
            ? `Imported ${plural(summary.insertedCount, 'transaction')}`
            : `Import ${IMPORT_STATUS_LABELS[summary.status].toLowerCase()}`}
        </h1>
        <p className="text-muted-foreground text-sm">
          {summary.filename} · {accountName}
          {summary.dateMin !== null &&
            summary.dateMax !== null &&
            ` · ${summary.dateMin} to ${summary.dateMax}`}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Import counts">
        {counts.map(([label, value]) => (
          <div key={label} className="rounded-md border p-3">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-xl font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        {summary.status === 'committed' && summary.kind === 'csv' && summary.insertedCount > 0 && (
          <Button asChild>
            <Link to="/uncategorized">Categorize new transactions</Link>
          </Button>
        )}
        <Button asChild variant="outline">
          <Link to="/import">Import another file</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/import/history">Import history</Link>
        </Button>
      </div>
    </section>
  );
}
