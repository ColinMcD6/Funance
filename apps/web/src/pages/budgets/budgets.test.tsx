import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS, type MockCall } from '@/test-utils/mock-api';

function category(id: number, name: string, kind = 'expense', archived = false) {
  return { id, name, kind, color: '#16a34a', sortOrder: id, archived, groupName: name };
}

const CATEGORIES = [
  category(1, 'Groceries'),
  category(2, 'Coffee'),
  category(3, 'Card Payment', 'transfer'),
  category(4, 'Baby', 'expense', true),
];

type StoredBudget = {
  id: number;
  categoryId: number;
  ownerId: number | null;
  monthlyAmountCents: number;
  effectiveFrom: string;
};

let stored: StoredBudget[] = [];

function api(options: { putStatus?: number } = {}): MockCall[] {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/categories': () => ({ body: CATEGORIES }),
    'GET /api/budgets': () => ({ body: stored }),
    'PUT /api/budgets': (call) => {
      if (options.putStatus !== undefined) {
        return {
          status: options.putStatus,
          body: { error: { code: 'validation_error', message: 'Server said no' } },
        };
      }
      const { budgets } = call.body as { budgets: Omit<StoredBudget, 'id'>[] };
      stored = budgets.map((b, i) => ({ id: 100 + i, ...b }));
      return { body: stored };
    },
  });
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
  stored = [
    { id: 1, categoryId: 2, ownerId: 1, monthlyAmountCents: 3000, effectiveFrom: '2025-01' },
    { id: 2, categoryId: 1, ownerId: null, monthlyAmountCents: 60000, effectiveFrom: '2025-01' },
    { id: 3, categoryId: 1, ownerId: null, monthlyAmountCents: 70000, effectiveFrom: '2099-01' },
  ];
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 15));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

function rows() {
  return screen.getAllByTestId('budget-row');
}

describe('Budgets page', () => {
  it('is linked from Settings', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/settings');
    await user.click(await screen.findByRole('link', { name: 'Edit budgets' }));
    expect(await screen.findByRole('heading', { name: 'Budgets', level: 1 })).toBeInTheDocument();
  });

  it('lists the budgets in category order and marks the ones in effect this month', async () => {
    api();
    renderAt('/settings/budgets');
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    const [first, second, third] = rows();
    if (first === undefined || second === undefined || third === undefined) throw new Error();
    expect(within(first).getByRole('combobox', { name: 'Category' })).toHaveValue('1');
    expect(within(first).getByRole('textbox', { name: 'Monthly amount' })).toHaveValue('600.00');
    expect(within(first).getByText('In effect')).toBeInTheDocument();
    // The 2099 row has not started yet.
    expect(within(second).getByLabelText('From')).toHaveValue('2099-01');
    expect(within(second).queryByText('In effect')).toBeNull();
    expect(within(third).getByRole('combobox', { name: 'For' })).toHaveValue('1');
    expect(within(third).getByText('In effect')).toBeInTheDocument();
    // Transfers cannot have a budget; archived categories are not offered for new ones.
    const options = within(first)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(options).toContain('Groceries');
    expect(options).not.toContain('Card Payment');
    expect(options.join()).not.toContain('Baby');
  });

  it('adds, edits and removes rows, then saves them all with one PUT', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/settings/budgets');
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    expect(screen.getByRole('button', { name: 'Save budgets' })).toBeDisabled();

    // Remove the future Groceries row.
    const future = rows()[1];
    if (future === undefined) throw new Error();
    await user.click(within(future).getByRole('button', { name: 'Remove Groceries budget' }));
    expect(rows()).toHaveLength(2);

    // Add an Emily Coffee budget from this month.
    await user.click(screen.getByRole('button', { name: 'Add budget' }));
    const added = rows()[2];
    if (added === undefined) throw new Error();
    expect(within(added).getByLabelText('From')).toHaveValue('2026-11');
    await user.selectOptions(within(added).getByRole('combobox', { name: 'Category' }), 'Coffee');
    await user.selectOptions(within(added).getByRole('combobox', { name: 'For' }), 'Emily');
    await user.type(within(added).getByRole('textbox', { name: 'Monthly amount' }), '45.50');

    await user.click(screen.getByRole('button', { name: 'Save budgets' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Budgets saved.');
    const puts = calls.filter((c) => c.method === 'PUT');
    expect(puts).toHaveLength(1);
    expect(puts[0]?.body).toEqual({
      budgets: [
        { categoryId: 1, ownerId: null, monthlyAmountCents: 60000, effectiveFrom: '2025-01' },
        { categoryId: 2, ownerId: 1, monthlyAmountCents: 3000, effectiveFrom: '2025-01' },
        { categoryId: 2, ownerId: 2, monthlyAmountCents: 4550, effectiveFrom: '2026-11' },
      ],
    });
    expect(rows()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Save budgets' })).toBeDisabled();
  });

  it('points at a bad row and sends nothing', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/settings/budgets');
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    await user.click(screen.getByRole('button', { name: 'Add budget' }));
    await user.click(screen.getByRole('button', { name: 'Save budgets' }));
    const added = rows()[3];
    if (added === undefined) throw new Error();
    expect(within(added).getByRole('alert')).toHaveTextContent('Enter an amount of $0 or more.');

    // Same category, owner and month as the first row.
    await user.type(within(added).getByRole('textbox', { name: 'Monthly amount' }), '1');
    const from = within(added).getByLabelText('From');
    await user.clear(from);
    await user.type(from, '2025-01');
    await user.click(screen.getByRole('button', { name: 'Save budgets' }));
    expect(within(added).getByRole('alert')).toHaveTextContent(
      'Another budget has the same category, owner and start month.',
    );
    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Discard changes' }));
    expect(rows()).toHaveLength(3);
  });

  it('shows a server error and keeps the draft', async () => {
    api({ putStatus: 400 });
    const user = userEvent.setup();
    renderAt('/settings/budgets');
    await waitFor(() => {
      expect(rows()).toHaveLength(3);
    });
    const first = rows()[0];
    if (first === undefined) throw new Error();
    const amount = within(first).getByRole('textbox', { name: 'Monthly amount' });
    await user.clear(amount);
    await user.type(amount, '650');
    await user.click(screen.getByRole('button', { name: 'Save budgets' }));
    expect(await screen.findByText('Server said no')).toBeInTheDocument();
    expect(amount).toHaveValue('650');
  });
});
