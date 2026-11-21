import type { PreviewRowStatus } from '@funance/shared';
import { Badge } from '@/components/ui/badge';
import { ROW_STATUS_LABELS } from './import-labels';

/** A preview row's status: new stands out, errors are red, the rest are muted. */
export function RowStatusBadge({ status }: { status: PreviewRowStatus }) {
  const variant = status === 'new' ? 'default' : status === 'error' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{ROW_STATUS_LABELS[status]}</Badge>;
}
