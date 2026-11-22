import { Link } from 'react-router';
import { Button } from '@/components/ui/button';

/** Settings section: a link to the Budgets page (M9). */
export function BudgetsSection() {
  return (
    <section aria-labelledby="budgets-heading" className="flex flex-col gap-3">
      <h2 id="budgets-heading" className="text-lg font-semibold">
        Budgets
      </h2>
      <p className="text-muted-foreground text-sm">
        Monthly amounts per category. The Dashboard shows how each month compares.
      </p>
      <div>
        <Button asChild variant="outline">
          <Link to="/settings/budgets">Edit budgets</Link>
        </Button>
      </div>
    </section>
  );
}
