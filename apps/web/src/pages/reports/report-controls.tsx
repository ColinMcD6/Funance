import { addMonths } from '@funance/core/reports';
import type { Owner } from '@funance/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { GroupBy, OwnerChoice, ReportView } from './report-view';
import { SegmentedControl, type SegmentOption } from './segmented-control';

/** Month picker, owner switch and category / major category switch, shared by both pages. */
export function ReportControls({
  view,
  owners,
  onChange,
  monthLabel = 'Month',
}: {
  view: ReportView;
  owners: readonly Owner[];
  onChange: (change: Partial<ReportView>) => void;
  monthLabel?: string;
}) {
  const ownerOptions: SegmentOption<OwnerChoice>[] = [
    ...[...owners]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((o) => ({ value: o.id, label: o.name })),
    { value: 'all', label: 'All' },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex w-full items-center gap-1 sm:w-auto">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => {
            onChange({ month: addMonths(view.month, -1) });
          }}
        >
          <ChevronLeft />
        </Button>
        <Input
          type="month"
          aria-label={monthLabel}
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
          value={view.month}
          onChange={(e) => {
            if (/^\d{4}-\d{2}$/.test(e.target.value)) onChange({ month: e.target.value });
          }}
        />
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          onClick={() => {
            onChange({ month: addMonths(view.month, 1) });
          }}
        >
          <ChevronRight />
        </Button>
      </div>
      <SegmentedControl
        label="Owner"
        options={ownerOptions}
        value={view.owner}
        onChange={(owner) => {
          onChange({ owner });
        }}
      />
      <SegmentedControl<GroupBy>
        label="Group by"
        options={[
          { value: 'category', label: 'Categories' },
          { value: 'group', label: 'Major categories' },
        ]}
        value={view.groupBy}
        onChange={(groupBy) => {
          onChange({ groupBy });
        }}
      />
    </div>
  );
}
