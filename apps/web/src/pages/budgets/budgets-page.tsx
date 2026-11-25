import { Link } from 'react-router';
import { useBudgets, useCategories, useOwners } from '@/api/queries';
import { BudgetEditor } from './budget-editor';

/**
 * Settings → Budgets: every budget row, editable as a draft and saved together (PUT /budgets
 * replaces them all). A row applies from its start month until a later row for the same
 * category and owner starts, so a change of budget is a new row, and history stays intact.
 */
export function BudgetsPage() {
  const budgets = useBudgets();
  const categories = useCategories();
  const owners = useOwners();

  const error = budgets.error ?? categories.error ?? owners.error;

  return (
    <div className="flex max-w-4xl min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Link to="/settings" className="text-muted-foreground text-sm hover:underline">
          ← Settings
        </Link>
        <h1 className="text-2xl font-semibold">Budgets</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        A monthly amount per category, for the household or for one person. Each budget applies from
        its start month until a later one for the same category and person starts. On the Dashboard,
        All uses the household budget, or adds up the personal ones when there is no household
        budget; one person&apos;s view uses only that person&apos;s budget.
      </p>
      {error !== null && (
        <p role="alert" className="text-destructive text-sm">
          {error.message}
        </p>
      )}
      {budgets.isSuccess && categories.isSuccess && owners.isSuccess && (
        <BudgetEditor saved={budgets.data} categories={categories.data} owners={owners.data} />
      )}
    </div>
  );
}
