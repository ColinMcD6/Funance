import { Ellipsis } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { cn } from '@/lib/utils';
import { NAV_ITEMS } from './nav-items';

function itemClass(isActive: boolean): string {
  return cn(
    'flex w-full flex-col items-center gap-0.5 px-0.5 py-2 text-[11px] leading-tight',
    isActive ? 'text-primary font-semibold' : 'text-muted-foreground',
  );
}

const BAR_ITEMS = NAV_ITEMS.filter((item) => item.more !== true);
const MORE_ITEMS = NAV_ITEMS.filter((item) => item.more === true);

/**
 * The fixed bottom bar on phones (below the `md` breakpoint): the main pages, and a More button
 * that opens a list of the rest above the bar.
 */
export function PhoneNav() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const inMore = MORE_ITEMS.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`),
  );
  const close = () => {
    setOpen(false);
  };

  return (
    <nav
      aria-label="Main"
      className="bg-background fixed inset-x-0 bottom-0 z-10 border-t md:hidden"
    >
      {open && (
        <ul id="more-pages" className="flex flex-col border-b p-2">
          {MORE_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                onClick={close}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium',
                    isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
                  )
                }
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
                {item.badge !== undefined && <item.badge compact={false} />}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
      <ul className="grid auto-cols-fr grid-flow-col">
        {BAR_ITEMS.map((item) => (
          <li key={item.to} className="min-w-0">
            <NavLink
              to={item.to}
              end={item.to === '/'}
              aria-label={item.label}
              onClick={close}
              className={({ isActive }) => itemClass(isActive)}
            >
              <span className="relative">
                <item.icon className="size-5" aria-hidden />
                {item.badge !== undefined && <item.badge compact />}
              </span>
              <span className="w-full truncate text-center">{item.shortLabel}</span>
            </NavLink>
          </li>
        ))}
        {MORE_ITEMS.length > 0 && (
          <li className="min-w-0">
            <button
              type="button"
              aria-expanded={open}
              aria-controls="more-pages"
              className={itemClass(open || inMore)}
              onClick={() => {
                setOpen(!open);
              }}
            >
              <Ellipsis className="size-5" aria-hidden />
              <span className="w-full truncate text-center">More</span>
            </button>
          </li>
        )}
      </ul>
    </nav>
  );
}
