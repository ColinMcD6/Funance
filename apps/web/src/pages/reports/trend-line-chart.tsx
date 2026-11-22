import { formatCents } from '@funance/core/money';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { compactDollars, shortMonthLabel, type Bucket, type TrendPoint } from './report-view';

/** One line of monthly spending per selected category (or major category). */
export function TrendLineChart({
  points,
  buckets,
}: {
  points: readonly TrendPoint[];
  buckets: readonly Bucket[];
}) {
  const labels = new Map(buckets.map((b) => [b.key, b.label]));
  const labelOf = (key: unknown): string =>
    typeof key === 'string' ? (labels.get(key) ?? key) : '';
  return (
    <div data-testid="trend-line-chart" className="h-72 w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={[...points]} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.3} />
          <XAxis dataKey="month" tickFormatter={shortMonthLabel} fontSize={11} minTickGap={4} />
          <YAxis tickFormatter={compactDollars} fontSize={11} width={48} />
          <Tooltip
            labelFormatter={(month) => (typeof month === 'string' ? shortMonthLabel(month) : month)}
            formatter={(value, key) => [formatCents(Number(value)), labelOf(key)]}
          />
          <Legend formatter={labelOf} />
          {buckets.map((bucket) => (
            <Line
              key={bucket.key}
              type="monotone"
              dataKey={bucket.key}
              stroke={bucket.color}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
