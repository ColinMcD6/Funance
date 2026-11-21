import type { ImportSummary } from '@funance/shared';
import { useState } from 'react';
import { useImport, useUndoImport } from '@/api/queries';
import { Button } from '@/components/ui/button';
import { plural } from './import-labels';

/**
 * Undo button for a committed import. It first asks for confirmation, stating how many
 * transactions will be deleted and how many of them were categorized by hand.
 */
export function UndoImport({ summary }: { summary: ImportSummary }) {
  const [confirming, setConfirming] = useState(false);
  const detail = useImport(summary.id, { enabled: confirming });
  const undo = useUndoImport();

  if (!confirming) {
    return (
      <Button
        variant="outline"
        size="sm"
        aria-label={`Undo import ${summary.id}`}
        onClick={() => {
          setConfirming(true);
        }}
      >
        Undo
      </Button>
    );
  }

  const manual = detail.data?.manuallyCategorizedCount;
  return (
    <div
      role="alertdialog"
      aria-label={`Confirm undo of import ${summary.id}`}
      className="bg-muted/40 flex w-full flex-col gap-2 rounded-md border p-3 text-sm"
    >
      <p>
        Undo {summary.filename}? This deletes the {plural(summary.insertedCount, 'transaction')} it
        added.
        {manual === undefined
          ? ' Checking for manual categories…'
          : manual > 0
            ? manual === 1
              ? ' 1 of them was categorized by hand, and that category will be lost.'
              : ` ${manual} of them were categorized by hand, and those categories will be lost.`
            : ' None of them were categorized by hand.'}
      </p>
      {undo.isError && (
        <p role="alert" className="text-destructive">
          {undo.error.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          size="sm"
          disabled={manual === undefined || undo.isPending}
          onClick={() => {
            undo.mutate(summary.id, {
              onSuccess: () => {
                setConfirming(false);
              },
            });
          }}
        >
          {undo.isPending ? 'Undoing…' : 'Undo import'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={undo.isPending}
          onClick={() => {
            setConfirming(false);
            undo.reset();
          }}
        >
          Keep
        </Button>
      </div>
    </div>
  );
}
