import type { PreviewRowStatus } from '@funance/shared';
import { Button } from '@/components/ui/button';
import { ROW_STATUS_LABELS, ROW_STATUSES } from './import-labels';

export type StatusFilterValue = PreviewRowStatus | 'all';

type Props = {
  value: StatusFilterValue;
  counts: Record<PreviewRowStatus, number>;
  onChange: (value: StatusFilterValue) => void;
};

/** Toggle buttons that limit the preview table to one row status, each with its count. */
export function StatusFilter({ value, counts, onChange }: Props) {
  const total = ROW_STATUSES.reduce((sum, s) => sum + counts[s], 0);
  const options: { value: StatusFilterValue; label: string; count: number }[] = [
    { value: 'all', label: 'All', count: total },
    ...ROW_STATUSES.map((s) => ({ value: s, label: ROW_STATUS_LABELS[s], count: counts[s] })),
  ];
  return (
    <div role="group" aria-label="Show rows" className="flex flex-wrap gap-2">
      {options.map((option) => (
        <Button
          key={option.value}
          type="button"
          size="sm"
          variant={value === option.value ? 'default' : 'outline'}
          aria-pressed={value === option.value}
          onClick={() => {
            onChange(option.value);
          }}
        >
          {option.label} ({option.count})
        </Button>
      ))}
    </div>
  );
}
