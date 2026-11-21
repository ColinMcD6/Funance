import { formatCents } from '@funance/core/money';
import type { PreviewRow } from '@funance/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { RowStatusBadge } from './row-status-badge';

type Props = {
  rows: readonly PreviewRow[];
  ownerName: (id: number | null) => string;
  categoryName: (id: number | null) => string;
  /** Where a row is in the file; defaults to its line number. Also the row's React key. */
  lineLabel?: (row: PreviewRow) => string;
  /** With a selection, each `new` row gets an include checkbox. */
  selection?: {
    isIncluded: (row: PreviewRow) => boolean;
    onToggle: (row: PreviewRow, included: boolean) => void;
  };
};

function amountClass(cents: number | null): string {
  return cn('tabular-nums whitespace-nowrap', cents !== null && cents > 0 && 'text-green-700');
}

/**
 * The preview rows: a table on wide screens and a list of cards on phones. Skipped and error
 * rows show their reason where a parsed row shows its description.
 */
export function PreviewRows({ rows, ownerName, categoryName, lineLabel, selection }: Props) {
  const label = lineLabel ?? ((row: PreviewRow) => String(row.line));
  const cardLabel = lineLabel ?? ((row: PreviewRow) => `Line ${row.line}`);
  if (rows.length === 0) {
    return <p className="text-muted-foreground text-sm">No rows with this status.</p>;
  }
  const detail = (row: PreviewRow) =>
    row.reason !== null ? (
      <span className={row.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}>
        {row.reason}
      </span>
    ) : (
      row.description
    );
  const include = (row: PreviewRow) =>
    selection !== undefined && row.status === 'new' ? (
      <Checkbox
        aria-label={`Include line ${label(row)}`}
        checked={selection.isIncluded(row)}
        onCheckedChange={(checked) => {
          selection.onToggle(row, checked === true);
        }}
      />
    ) : null;

  return (
    <>
      <div className="hidden overflow-x-auto rounded-md border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              {selection !== undefined && <th className="w-8 p-2 font-medium">Include</th>}
              <th className="p-2 font-medium">Line</th>
              <th className="p-2 font-medium">Status</th>
              <th className="p-2 font-medium">Date</th>
              <th className="p-2 text-right font-medium">Amount</th>
              <th className="p-2 font-medium">Description</th>
              <th className="p-2 font-medium">Owner</th>
              <th className="p-2 font-medium">Category</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={label(row)} data-testid="preview-row" className="border-t align-top">
                {selection !== undefined && <td className="p-2">{include(row)}</td>}
                <td className="text-muted-foreground p-2 tabular-nums">{label(row)}</td>
                <td className="p-2">
                  <RowStatusBadge status={row.status} />
                </td>
                <td className="p-2 whitespace-nowrap tabular-nums">{row.date ?? ''}</td>
                <td className={cn('p-2 text-right', amountClass(row.amountCents))}>
                  {row.amountCents === null ? '' : formatCents(row.amountCents)}
                </td>
                <td className="p-2 break-words">{detail(row)}</td>
                <td className="p-2">{ownerName(row.ownerId)}</td>
                <td className="p-2">{categoryName(row.categoryId)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-col divide-y rounded-md border md:hidden">
        {rows.map((row) => (
          <li
            key={label(row)}
            data-testid="preview-card"
            className="flex flex-col gap-1 p-3 text-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {include(row)}
                <RowStatusBadge status={row.status} />
                <span className="text-muted-foreground tabular-nums">
                  {cardLabel(row)}
                  {row.date !== null && ` · ${row.date}`}
                </span>
              </span>
              <span className={cn('font-medium', amountClass(row.amountCents))}>
                {row.amountCents === null ? '' : formatCents(row.amountCents)}
              </span>
            </div>
            <div className="break-words">{detail(row)}</div>
            {row.ownerId !== null && (
              <div className="text-muted-foreground text-xs">
                {ownerName(row.ownerId)}
                {row.categoryId !== null && ` · ${categoryName(row.categoryId)}`}
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}
