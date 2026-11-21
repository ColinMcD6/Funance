import type { LegacyPreviewResponse, PreviewRowStatus } from '@funance/shared';
import { useState } from 'react';
import { useOwners } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { plural, ROW_STATUSES } from '@/pages/import/import-labels';
import { PreviewRows } from '@/pages/import/preview-rows';
import { StatusFilter, type StatusFilterValue } from '@/pages/import/status-filter';
import { legacyCategoryNames, legacyRowLabel } from './legacy-labels';
import { LegacyMonthTotals } from './legacy-month-totals';
import { LegacyViolations } from './legacy-violations';

type Props = {
  preview: LegacyPreviewResponse;
  committing: boolean;
  commitError: string | null;
  onCommit: () => void;
  onCancel: () => void;
};

/** The checked workbook: month totals, problems to fix, its rows, Commit (once clean) and Cancel. */
export function LegacyPreview({ preview, committing, commitError, onCommit, onCancel }: Props) {
  const [filter, setFilter] = useState<StatusFilterValue>('all');
  const owners = useOwners();
  const categoryNames = legacyCategoryNames(preview.rows);
  const counts = Object.fromEntries(
    ROW_STATUSES.map((s) => [s, preview.rows.filter((r) => r.status === s).length]),
  ) as Record<PreviewRowStatus, number>;
  const shown = filter === 'all' ? preview.rows : preview.rows.filter((r) => r.status === filter);
  const ownerName = (id: number | null) =>
    id === null ? '' : (owners.data?.find((o) => o.id === id)?.name ?? `Owner ${id}`);
  const categoryName = (id: number | null) =>
    id === null ? '—' : (categoryNames.get(id) ?? `Category ${id}`);
  const { import: summary, violations } = preview;
  const blocked = violations.length > 0;

  return (
    <section aria-labelledby="legacy-preview-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="legacy-preview-heading" className="text-lg font-semibold">
          Preview: {summary.filename}
        </h2>
        <p className="text-muted-foreground text-sm">
          {plural(counts.new, 'transaction')} ready
          {summary.dateMin !== null &&
            summary.dateMax !== null &&
            ` · ${summary.dateMin} to ${summary.dateMax}`}
        </p>
      </div>

      <p className="text-muted-foreground text-sm">
        Compare each month with the workbook. The sheet total is the sum of its Amount column,
        spending positive, so it matches the sheet even though the app counts Investing as saved.
      </p>
      <LegacyMonthTotals totals={preview.monthTotals} />

      {preview.sameFileImportIds.length > 0 && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">
          This exact workbook was imported before (import{' '}
          {preview.sameFileImportIds.map((id) => `#${id}`).join(', ')}).
        </p>
      )}
      {blocked && <LegacyViolations violations={violations} />}

      <StatusFilter value={filter} counts={counts} onChange={setFilter} />
      <PreviewRows
        rows={shown}
        ownerName={ownerName}
        categoryName={categoryName}
        lineLabel={legacyRowLabel}
      />

      {blocked && (
        <p className="text-destructive text-sm">
          Fix every problem listed above in the workbook, save it, and upload it again. Commit is
          available once there are none.
        </p>
      )}
      {commitError !== null && (
        <p role="alert" className="text-destructive text-sm">
          {commitError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={blocked || committing} onClick={onCommit}>
          {committing ? 'Committing…' : `Commit ${plural(counts.new, 'transaction')}`}
        </Button>
        <Button type="button" variant="outline" disabled={committing} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
