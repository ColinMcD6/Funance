import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Settings section: the one-time import of the old tracking workbook. */
export function LegacyImportSection() {
  return (
    <section aria-labelledby="legacy-heading" className="flex flex-col gap-3">
      <h2 id="legacy-heading" className="text-lg font-semibold">
        Legacy spreadsheet
      </h2>
      <p className="text-muted-foreground text-sm">
        Load the old monthly tracking workbook (.xlsx) once. Its transactions keep their category
        and owner and have no account.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link to="/settings/legacy-import">Import legacy spreadsheet</Link>
        </Button>
      </div>
    </section>
  );
}
