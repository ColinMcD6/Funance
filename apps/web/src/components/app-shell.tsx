import { NavLink, Outlet } from 'react-router';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';
import { ProfileSwitcher } from './profile/profile-switcher';

function linkClass(isActive: boolean): string {
  return cn(
    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
    isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted',
  );
}

/**
 * The layout around every page: a header with the profile switcher, a sidebar on desktop,
 * and a fixed bottom bar on phones (below the `md` breakpoint).
 */
export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-background sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b px-4">
        <span className="truncate text-lg font-semibold">Finance Tracker</span>
        <ProfileSwitcher />
      </header>
      <div className="flex min-w-0 flex-1">
        <nav aria-label="Main" className="hidden w-52 shrink-0 border-r p-3 md:block">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => linkClass(isActive)}
                >
                  <item.icon className="size-4" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0 flex-1 p-4 pb-24 md:pb-4">
          <Outlet />
        </main>
      </div>
      <nav
        aria-label="Main"
        className="bg-background fixed inset-x-0 bottom-0 z-10 border-t md:hidden"
      >
        <ul className="grid grid-flow-col auto-cols-fr">
          {NAV_ITEMS.map((item) => (
            <li key={item.to} className="min-w-0">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                aria-label={item.label}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center gap-0.5 px-0.5 py-2 text-[10px] leading-tight',
                    isActive ? 'text-primary font-semibold' : 'text-muted-foreground',
                  )
                }
              >
                <item.icon className="size-5" aria-hidden />
                <span className="w-full truncate text-center">{item.shortLabel}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
