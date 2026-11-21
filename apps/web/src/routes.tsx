import type { RouteObject } from 'react-router';
import { ImportHistoryPage } from '@/pages/import/import-history-page';
import { ImportPage } from '@/pages/import/import-page';
import { ImportResultPage } from '@/pages/import/import-result-page';
import { PlaceholderPage } from '@/pages/placeholder/placeholder-page';
import { AccountFormPage } from '@/pages/settings/account-form-page';
import { LegacyImportPage } from '@/pages/settings/legacy-import-page';
import { SettingsPage } from '@/pages/settings/settings-page';
import { TransactionsPage } from '@/pages/transactions/transactions-page';

/** Pages inside the app shell. Append-only: one line per page; later milestones replace placeholders. */
export const PAGE_ROUTES: RouteObject[] = [
  { index: true, element: <PlaceholderPage title="Dashboard" milestone="M8" /> },
  { path: 'transactions', element: <TransactionsPage /> },
  { path: 'uncategorized', element: <PlaceholderPage title="Uncategorized" milestone="M7" /> },
  { path: 'import', element: <ImportPage /> },
  { path: 'rules', element: <PlaceholderPage title="Rules" milestone="M6" /> },
  { path: 'categories', element: <PlaceholderPage title="Categories" milestone="M6" /> },
  { path: 'settings', element: <SettingsPage /> },
  { path: 'settings/accounts/new', element: <AccountFormPage /> },
  { path: 'settings/accounts/:id', element: <AccountFormPage /> },
  { path: 'import/history', element: <ImportHistoryPage /> },
  { path: 'import/:id', element: <ImportResultPage /> },
  { path: 'settings/legacy-import', element: <LegacyImportPage /> },
  { path: '*', element: <PlaceholderPage title="Page not found" milestone="no milestone" /> },
];
