import { AccountList } from './account-list';
import { BudgetsSection } from './budgets-section';
import { LegacyImportSection } from './legacy-import-section';
import { OwnerNames } from './owner-names';

/** Settings: owner names and accounts. Later milestones add sections here. */
export function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <OwnerNames />
      <AccountList />
      <LegacyImportSection />
      <BudgetsSection />
    </div>
  );
}
