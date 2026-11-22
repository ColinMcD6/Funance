import {
  ArrowUpDown,
  FolderTree,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Settings,
  TrendingUp,
  Upload,
  type LucideIcon,
} from 'lucide-react';

export type NavItem = {
  to: string;
  label: string;
  /** Fits under the icon in the phone bottom bar. */
  shortLabel: string;
  icon: LucideIcon;
  /** On phones, listed under More instead of in the bottom bar, which fits about six items. */
  more?: boolean;
};

/** Main navigation, shared by the sidebar and the bottom bar. Append-only: one line per page. */
export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/', label: 'Dashboard', shortLabel: 'Home', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', shortLabel: 'Activity', icon: ArrowUpDown },
  { to: '/uncategorized', label: 'Uncategorized', shortLabel: 'Queue', icon: Inbox },
  { to: '/import', label: 'Import', shortLabel: 'Import', icon: Upload },
  { to: '/rules', label: 'Rules', shortLabel: 'Rules', icon: ListChecks, more: true },
  {
    to: '/categories',
    label: 'Categories',
    shortLabel: 'Categories',
    icon: FolderTree,
    more: true,
  },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, more: true },
  { to: '/trends', label: 'Trends', shortLabel: 'Trends', icon: TrendingUp },
];
