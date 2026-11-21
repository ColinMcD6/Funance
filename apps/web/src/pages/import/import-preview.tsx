import type { ImportPreviewResponse, PreviewRowStatus } from '@funance/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { useCategories, useOwners } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { plural, ROW_STATUSES } from './import-labels';
import { PreviewRows } from './preview-rows';
import { StatusFilter, type StatusFilterValue } from './status-filter';

type Props = {
  preview: ImportPreviewResponse;
  accountName: string;
  committing: boolean;
  commitError: string | null;
  onCommit: () => void;
  onCancel: () => void;
};

/** The parsed file before commit: counts, warnings, a filterable row list, Commit and Cancel. */
export function ImportPreview({
  preview,
  accountName,
  committing,
  commitError,
  onCommit,
  onCancel,
}: Props) {
  const [filter, setFilter] = useState<StatusFilterValue>('all');
  const owners = useOwners();
  // Category names are needed only when a rule assigned one (rules arrive in M6).
  const hasCategories = preview.rows.some((r) => r.categoryId !== null);
  const categories = useCategories({ enabled: hasCategories });

  const counts = Object.fromEntries(
    ROW_STATUSES.map((s) => [s, preview.rows.filter((r) => r.status === s).length]),
  ) as Record<PreviewRowStatus, number>;
  const shown = filter === 'all' ? preview.rows : preview.rows.filter((r) => r.status === filter);
  const ownerName = (id: number | null) =>
    id === null ? '' : (owners.data?.find((o) => o.id === id)?.name ?? `Owner ${id}`);
  const categoryName = (id: number | null) =>
    id === null ? '—' : (categories.data?.find((c) => c.id === id)?.name ?? `Category ${id}`);
  const { import: summary } = preview;

  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="preview-heading" className="text-lg font-semibold">
          Preview: {summary.filename}
        </h2>
        <p className="text-muted-foreground text-sm">
          {accountName}
          {summary.dateMin !== null &&
            summary.dateMax !== null &&
            ` · ${summary.dateMin} to ${summary.dateMax}`}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Row counts">
        {ROW_STATUSES.map((status) => (
          <div key={status} className="rounded-md border p-3">
            <dt className="text-muted-foreground text-xs capitalize">{status}</dt>
            <dd className="text-xl font-semibold tabular-nums" data-testid={`count-${status}`}>
              {counts[status]}
            </dd>
          </div>
        ))}
      </dl>

      {preview.sameFileImportIds.length > 0 && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          This exact file was imported before (import{' '}
          {preview.sameFileImportIds.map((id) => `#${id}`).join(', ')}). Its rows show as duplicates
          and will not be added again. See{' '}
          <Link to="/import/history" className="underline">
            Import history
          </Link>
          .
        </p>
      )}
      {counts.error > 0 && (
        <p className="text-destructive text-sm">
          {plural(counts.error, 'row')} could not be read and will not be imported. If every row
          fails, cancel and check the account’s mapping in Settings.
        </p>
      )}

      <StatusFilter value={filter} counts={counts} onChange={setFilter} />
      <PreviewRows rows={shown} ownerName={ownerName} categoryName={categoryName} />

      {commitError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {commitError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={committing} onClick={onCommit}>
          {committing ? 'Committing…' : `Commit ${plural(counts.new, 'new transaction')}`}
        </Button>
        <Button type="button" variant="outline" disabled={committing} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
