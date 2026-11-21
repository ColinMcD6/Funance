import { formatCents } from '@funance/core/money';
import type { LegacyMonthTotal } from '@funance/shared';

/** Rows and the sheet's raw Amount sum per month, to compare with the workbook. */
export function LegacyMonthTotals({ totals }: { totals: readonly LegacyMonthTotal[] }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm" aria-label="Month totals">
        <thead className="bg-muted/50 text-left">
          <tr>
            <th className="p-2 font-medium">Month</th>
            <th className="p-2 text-right font-medium">Rows</th>
            <th className="p-2 text-right font-medium">Sheet total</th>
          </tr>
        </thead>
        <tbody>
          {totals.map((total) => (
            <tr key={total.month} data-testid="month-total" className="border-t">
              <td className="p-2 tabular-nums">{total.month}</td>
              <td className="p-2 text-right tabular-nums">{total.count}</td>
              <td className="p-2 text-right tabular-nums">{formatCents(total.sheetTotalCents)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
