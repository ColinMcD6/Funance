import { AccountList } from './account-list';
import { BackupSection } from './backup-section';
import { BudgetsSection } from './budgets-section';
import { LegacyImportSection } from './legacy-import-section';
import { OwnerNames } from './owner-names';

/** Settings: owner names, accounts, the legacy import, budgets and backups. */
export function SettingsPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <OwnerNames />
      <AccountList />
      <LegacyImportSection />
      <BudgetsSection />
      <BackupSection />
    </div>
  );
}
