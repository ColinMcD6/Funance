import type { RouteObject } from 'react-router';
import { CategoriesPage } from '@/pages/categories/categories-page';
import { ImportHistoryPage } from '@/pages/import/import-history-page';
import { ImportPage } from '@/pages/import/import-page';
import { ImportResultPage } from '@/pages/import/import-result-page';
import { DashboardPage } from '@/pages/reports/dashboard-page';
import { TrendsPage } from '@/pages/reports/trends-page';
import { PlaceholderPage } from '@/pages/placeholder/placeholder-page';
import { AccountFormPage } from '@/pages/settings/account-form-page';
import { LegacyImportPage } from '@/pages/settings/legacy-import-page';
import { RulesPage } from '@/pages/rules/rules-page';
import { SettingsPage } from '@/pages/settings/settings-page';
import { TransactionsPage } from '@/pages/transactions/transactions-page';

/** Pages inside the app shell. Append-only: one line per page; later milestones replace placeholders. */
export const PAGE_ROUTES: RouteObject[] = [
  { index: true, element: <DashboardPage /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'uncategorized', element: <PlaceholderPage title="Uncategorized" milestone="M7" /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'rules', element: <RulesPage /> },
  { path: 'categories', element: <CategoriesPage /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'settings/accounts/new', element: <AccountFormPage /> },
  { path: 'settings/accounts/:id', element: <AccountFormPage /> },
  { path: 'import/history', element: <ImportHistoryPage /> },
  { path: 'import/:id', element: <ImportResultPage /> },
  { path: 'settings/legacy-import', element: <LegacyImportPage /> },
  { path: 'trends', element: <TrendsPage /> },
  { path: '*', element: <PlaceholderPage title="Page not found" milestone="no milestone" /> },
];
