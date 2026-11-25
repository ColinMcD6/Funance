import { LATEST_BACKUP_URL } from '@/api/client';
import { useCreateBackup } from '@/api/queries';
import { Button } from '@/components/ui/button';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} bytes`;
  if (bytes < 1024 * 1024) return `${String(Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Settings section: take a backup now and download the newest one. */
export function BackupSection() {
  const backup = useCreateBackup();
  return (
    <section aria-labelledby="backup-heading" className="flex flex-col gap-3">
      <h2 id="backup-heading" className="text-lg font-semibold">
        Backups
      </h2>
      <p className="text-muted-foreground text-sm">
        A backup is saved automatically every time the app starts and after every import. The newest
        30 are kept in the backups folder on the host computer. Download one to keep a copy on this
        device.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={backup.isPending}
          onClick={() => {
            backup.mutate();
          }}
        >
          {backup.isPending ? 'Backing up…' : 'Back up now'}
        </Button>
        <Button asChild variant="outline">
          <a href={LATEST_BACKUP_URL} download>
            Download latest backup
          </a>
        </Button>
      </div>
      {backup.isSuccess && (
        <p role="status" className="text-sm">
          Saved {backup.data.filename} ({formatSize(backup.data.sizeBytes)}).
        </p>
      )}
      {backup.isError && (
        <p role="alert" className="text-destructive text-sm">
          {backup.error.message}
        </p>
      )}
    </section>
  );
}
