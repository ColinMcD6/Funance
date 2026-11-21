import type { ImportStatus, PreviewRowStatus } from '@funance/shared';

export const ROW_STATUS_LABELS: Record<PreviewRowStatus, string> = {
  new: 'New',
  duplicate: 'Duplicate',
  skipped: 'Skipped',
  error: 'Error',
};

export const ROW_STATUSES: readonly PreviewRowStatus[] = ['new', 'duplicate', 'skipped', 'error'];

export const IMPORT_STATUS_LABELS: Record<ImportStatus, string> = {
  preview: 'Not committed',
  committed: 'Committed',
  undone: 'Undone',
};

/** `2026-11-20T12:00:00.000Z` -> `2026-11-20`, the app's display format for dates. */
export function dayOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/** "1 transaction" / "2 transactions". */
export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
