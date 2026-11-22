import { formatCents } from '@funance/core/money';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { compactDollars, shortMonthLabel, type Bucket, type TrendPoint } from './report-view';

/**
 * Monthly spending stacked by category (or major category). Clicking a segment calls
 * `onSelect` with its bucket and month.
 */
export function TrendStackChart({
  points,
  buckets,
  onSelect,
}: {
  points: readonly TrendPoint[];
  buckets: readonly Bucket[];
  onSelect: (bucket: Bucket, month: string) => void;
}) {
  const labels = new Map(buckets.map((b) => [b.key, b.label]));
  const labelOf = (key: unknown): string =>
    typeof key === 'string' ? (labels.get(key) ?? key) : '';
  return (
    <div data-testid="trend-stack-chart" className="h-80 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...points]} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.3} />
          <XAxis dataKey="month" tickFormatter={shortMonthLabel} fontSize={11} minTickGap={4} />
          <YAxis tickFormatter={compactDollars} fontSize={11} width={48} />
          <Tooltip
            labelFormatter={(month) => (typeof month === 'string' ? shortMonthLabel(month) : month)}
            formatter={(value, key) => [formatCents(Number(value)), labelOf(key)]}
          />
          {buckets.map((bucket) => (
            <Bar
              key={bucket.key}
              dataKey={bucket.key}
              stackId="spending"
              fill={bucket.color}
              cursor="pointer"
              onClick={(_, index) => {
                const point = points[index];
                if (point !== undefined) onSelect(bucket, point.month);
              }}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
