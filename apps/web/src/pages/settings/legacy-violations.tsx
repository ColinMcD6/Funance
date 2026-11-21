import type { LegacyViolation } from '@funance/shared';
import { violationPlace } from './legacy-labels';

/** Every rule of the format specification the workbook breaks. */
export function LegacyViolations({ violations }: { violations: readonly LegacyViolation[] }) {
  return (
    <section aria-labelledby="violations-heading" className="flex flex-col gap-2">
      <h3 id="violations-heading" className="text-destructive font-semibold">
        {violations.length} problem{violations.length === 1 ? '' : 's'} to fix in the workbook
      </h3>
      <ul className="flex flex-col divide-y rounded-md border text-sm">
        {violations.map((v, i) => (
          <li key={i} data-testid="violation" className="flex flex-col gap-0.5 p-2">
            <span className="font-medium">{violationPlace(v)}</span>
            <span>
              {v.message} <span className="text-muted-foreground">({v.rule})</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
