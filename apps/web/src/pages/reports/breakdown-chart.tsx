import { formatCents } from '@funance/core/money';
import {
  Bar,
  BarChart,
  Rectangle,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type BarShapeProps,
} from 'recharts';
import { compactDollars, type BreakdownBar } from './report-view';

const BAR_HEIGHT = 28;

/**
 * Horizontal bars of the month's spending per category (or major category), largest first.
 * Horizontal bars keep long category names readable at phone width. Clicking a bar calls
 * `onSelect`, which the page turns into a drill-down to Transactions.
 */
export function BreakdownChart({
  bars,
  onSelect,
}: {
  bars: readonly BreakdownBar[];
  onSelect: (bar: BreakdownBar) => void;
}) {
  if (bars.length === 0) {
    return <p className="text-muted-foreground text-sm">No spending this month.</p>;
  }
  return (
    <div
      data-testid="breakdown-chart"
      className="w-full min-w-0"
      style={{ height: bars.length * BAR_HEIGHT + 40 }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[...bars]} layout="vertical" margin={{ top: 4, right: 12, bottom: 4 }}>
          <XAxis type="number" tickFormatter={compactDollars} fontSize={12} />
          <YAxis
            type="category"
            dataKey="label"
            width={110}
            fontSize={12}
            tickLine={false}
            interval={0}
          />
          <Tooltip
            formatter={(value) => [formatCents(Number(value)), 'Spending']}
            cursor={{ fillOpacity: 0.1 }}
          />
          <Bar
            dataKey="cents"
            radius={[0, 4, 4, 0]}
            cursor="pointer"
            onClick={(_, index) => {
              const bar = bars[index];
              if (bar !== undefined) onSelect(bar);
            }}
            shape={(props: BarShapeProps) => (
              <Rectangle {...props} fill={bars[props.index]?.color ?? props.fill} />
            )}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
