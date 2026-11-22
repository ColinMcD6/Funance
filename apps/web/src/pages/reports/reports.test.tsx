import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS } from '@/test-utils/mock-api';

function category(id: number, name: string, groupName: string, kind = 'expense') {
  return { id, name, kind, color: '#16a34a', sortOrder: id, archived: false, groupName };
}

const CATEGORIES = [
  category(1, 'Groceries', 'Groceries'),
  category(2, 'Coffee', 'Joy'),
  category(4, 'Income', 'Money', 'income'),
  category(5, 'Investing', 'Money', 'savings'),
];

function reportRow(fields: Record<string, unknown>) {
  return {
    month: '2026-10',
    categoryId: null,
    groupName: null,
    spendingCents: 0,
    incomeCents: 0,
    savedCents: 0,
    count: 1,
    ...fields,
  };
}

/** Monthly rows per owner query value: the household, and Emily alone. */
const MONTHLY: Record<string, unknown[]> = {
  all: [
    reportRow({ categoryId: 1, groupName: 'Groceries', spendingCents: 18500, count: 4 }),
    reportRow({ categoryId: 2, groupName: 'Joy', spendingCents: 500 }),
    reportRow({ categoryId: 4, groupName: 'Money', incomeCents: 500000, count: 2 }),
    reportRow({ categoryId: 5, groupName: 'Money', savedCents: 50000 }),
    reportRow({ spendingCents: 3200, count: 2 }),
  ],
  '2': [
    reportRow({ categoryId: 1, groupName: 'Groceries', spendingCents: 6000 }),
    reportRow({ categoryId: 4, groupName: 'Money', incomeCents: 200000 }),
  ],
};

const COMPARE = {
  month: '2026-10',
  rows: [
    {
      categoryId: 1,
      thisMonthCents: 18500,
      previousMonthCents: 8000,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 8000,
    },
    {
      categoryId: null,
      thisMonthCents: 3200,
      previousMonthCents: 0,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 0,
    },
    {
      categoryId: 4,
      thisMonthCents: 500000,
      previousMonthCents: 200000,
      sameMonthLastYearCents: null,
      trailing3MonthAvgCents: 200000,
    },
  ],
};

function api() {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/categories': () => ({ body: CATEGORIES }),
    'GET /api/reports/monthly': () => ({
      body: { rows: MONTHLY[lastQuery('monthly').owner ?? 'all'] ?? [] },
    }),
    'GET /api/reports/compare': () => ({ body: COMPARE }),
  });
}

function queries(report: 'monthly' | 'compare'): Record<string, string>[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => new URL(input as string, 'http://localhost'))
    .filter((url) => url.pathname === `/api/reports/${report}`)
    .map((url) => Object.fromEntries(url.searchParams));
}

function lastQuery(report: 'monthly' | 'compare'): Record<string, string> {
  return queries(report).at(-1) ?? {};
}

function renderAt(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <App
      queryClient={queryClient}
      router={(routes: RouteObject[]) => createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Dashboard', () => {
  it('opens on the active profile and shows its totals', async () => {
    api();
    renderAt('/?month=2026-10');
    await screen.findByRole('heading', { name: 'Dashboard' });
    await waitFor(() => {
      expect(lastQuery('monthly')).toEqual({
        from: '2026-10',
        to: '2026-10',
        owner: '1',
        groupBy: 'category',
      });
    });
    expect(lastQuery('compare')).toEqual({ month: '2026-10', owner: '1' });
    expect(screen.getByRole('button', { name: 'Colin' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dashboard-month')).toHaveTextContent('October 2026');
  });

  it('shows income, spending, saved, left over and the uncategorized warning', async () => {
    api();
    renderAt('/?month=2026-10&owner=all');
    expect(await screen.findByTestId('total-income')).toHaveTextContent('$5,000.00');
    expect(screen.getByTestId('total-spending')).toHaveTextContent('$190.00');
    expect(screen.getByTestId('total-saved')).toHaveTextContent('$500.00');
    // 500000 - 19000 - 50000
    expect(screen.getByTestId('total-left-over')).toHaveTextContent('$4,310.00');
    const warning = screen.getByTestId('uncategorized-warning');
    expect(warning).toHaveTextContent('2 uncategorized transactions ($32.00)');
    expect(warning).toHaveAttribute(
      'href',
      '/transactions?category=none&from=2026-10-01&to=2026-10-31&excluded=false',
    );
  });

  it('switching owner changes the totals and every request', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/?month=2026-10&owner=all');
    expect(await screen.findByTestId('total-spending')).toHaveTextContent('$190.00');
    await user.click(screen.getByRole('button', { name: 'Emily' }));
    await waitFor(() => {
      expect(screen.getByTestId('total-spending')).toHaveTextContent('$60.00');
    });
    expect(screen.getByTestId('total-income')).toHaveTextContent('$2,000.00');
    expect(screen.queryByTestId('uncategorized-warning')).not.toBeInTheDocument();
    expect(lastQuery('compare')).toEqual({ month: '2026-10', owner: '2' });
  });

  it('links each category in the table to its filtered transactions', async () => {
    api();
    renderAt('/?month=2026-10&owner=2');
    const table = await screen.findByTestId('compare-table');
    expect(within(table).getByRole('link', { name: 'Groceries' })).toHaveAttribute(
      'href',
      '/transactions?owner=2&category=1&from=2026-10-01&to=2026-10-31&excluded=false',
    );
    expect(within(table).getByRole('link', { name: 'Uncategorized' })).toHaveAttribute(
      'href',
      '/transactions?owner=2&category=none&from=2026-10-01&to=2026-10-31&excluded=false',
    );
    // No data a year ago: a dash, not $0.00.
    const groceries = within(table).getByRole('link', { name: 'Groceries' }).closest('tr');
    expect(groceries).not.toBeNull();
    if (groceries !== null) {
      expect(groceries).toHaveTextContent('$185.00');
      expect(groceries).toHaveTextContent('+$105.00');
      expect(groceries).toHaveTextContent('—');
    }
  });

  it('moves between months and switches to major categories', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/?month=2026-01&owner=all');
    await screen.findByTestId('compare-table');
    await user.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => {
      expect(lastQuery('compare').month).toBe('2025-12');
    });
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await user.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => {
      expect(lastQuery('compare').month).toBe('2026-02');
    });
    await user.click(screen.getByRole('button', { name: 'Major categories' }));
    await waitFor(() => {
      expect(lastQuery('monthly').groupBy).toBe('group');
    });
    expect(screen.getByText(/Switch to Categories/)).toBeInTheDocument();
  });
});

describe('Trends', () => {
  it('asks for 12 months ending at the month, then 24', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/trends?month=2026-10&owner=all');
    await screen.findByRole('heading', { name: 'Trends' });
    await waitFor(() => {
      expect(lastQuery('monthly')).toMatchObject({ from: '2025-11', to: '2026-10', owner: 'all' });
    });
    await user.click(screen.getByRole('button', { name: '24 months' }));
    await waitFor(() => {
      expect(lastQuery('monthly')).toMatchObject({ from: '2024-11', to: '2026-10' });
    });
  });

  it('lists the spending categories as line choices, the largest picked', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/trends?month=2026-10&owner=all');
    const groceries = await screen.findByRole('checkbox', { name: 'Groceries' });
    expect(groceries).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Uncategorized' })).toBeChecked();
    expect(screen.queryByRole('checkbox', { name: 'Income' })).not.toBeInTheDocument();
    await user.click(groceries);
    expect(groceries).not.toBeChecked();
  });
});
