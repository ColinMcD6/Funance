import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useCommitImport, usePreviewLegacyImport } from '@/api/queries';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LegacyPreview } from './legacy-preview';

/** Settings › Import legacy spreadsheet: upload the workbook, check it, then commit. */
export function LegacyImportPage() {
  const preview = usePreviewLegacyImport();
  const commit = useCommitImport();
  const navigate = useNavigate();
  const fileInput = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);

  function cancel() {
    preview.reset();
    commit.reset();
    setFile(null);
    if (fileInput.current !== null) fileInput.current.value = '';
  }

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Import legacy spreadsheet</h1>
        <Link to="/settings" className="text-muted-foreground text-sm underline">
          Back to Settings
        </Link>
      </div>

      {preview.data === undefined ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (file !== null) preview.mutate(file);
          }}
          className="flex max-w-xl flex-col gap-4"
          aria-label="Upload workbook"
        >
          <FormField
            label="Workbook"
            hint="The old tracking workbook saved as .xlsx, one sheet per month named MM-YYYY."
          >
            {(id) => (
              <Input
                id={id}
                ref={fileInput}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                }}
              />
            )}
          </FormField>
          {preview.error !== null && (
            <p role="alert" className="text-destructive text-sm">
              {preview.error.message}
            </p>
          )}
          <div>
            <Button type="submit" disabled={file === null || preview.isPending}>
              {preview.isPending ? 'Checking workbook…' : 'Preview'}
            </Button>
          </div>
        </form>
      ) : (
        <LegacyPreview
          preview={preview.data}
          committing={commit.isPending}
          commitError={commit.error?.message ?? null}
          onCancel={cancel}
          onCommit={() => {
            commit.mutate(
              { id: preview.data.import.id },
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
