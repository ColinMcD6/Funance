import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS } from '@/test-utils/mock-api';

const MAPPING = {
  encoding: 'utf-8',
  hasHeader: true,
  columns: { date: 'Date', description: ['Memo'], amount: 'Amount' },
  dateFormat: 'MM/dd/yyyy',
  amountSign: 'negative_is_outflow',
  skipZeroAmount: true,
};

const ACCOUNTS = [
  {
    id: 1,
    name: 'Tangerine Chequing',
    institution: 'tangerine',
    type: 'chequing',
    defaultOwnerId: 1,
    csvMapping: MAPPING,
    archived: false,
    createdAt: '2026-11-20T12:00:00.000Z',
  },
];

function category(id: number, name: string, groupName: string, archived = false) {
  return { id, name, kind: 'expense', color: '#16a34a', sortOrder: id, archived, groupName };
}

const CATEGORIES = [
  category(4, 'Groceries', 'Groceries'),
  category(6, 'Coffee', 'Joy'),
  category(7, 'Eating out', 'Joy'),
  category(9, 'Old stuff', 'Joy', true),
];

function transaction(id: number, fields: Record<string, unknown> = {}) {
  return {
    id,
    accountId: 1,
    importId: 1,
    ownerId: 1,
    categoryId: null,
    categorySource: null,
    ruleId: null,
    date: '2026-09-0' + String(id),
    postedDate: null,
    amountCents: -1000 * id,
    description: `Shop ${id}`,
    memo: null,
    merchantKey: `SHOP`,
    bankCategory: null,
    externalId: null,
    dedupKey: `key-${id}`,
    occurrence: 1,
    notes: null,
    excluded: false,
    rawRow: {},
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    ...fields,
  };
}

const ITEMS = [
  transaction(1, { categoryId: 9, categorySource: 'manual', notes: 'A note' }),
  transaction(2, { memo: 'Coffee run', excluded: true }),
  transaction(3, { accountId: null, amountCents: 2500 }),
];

function api(
  overrides: Parameters<typeof mockApi>[0] = {},
  list = { items: ITEMS, total: ITEMS.length },
) {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/accounts': () => ({ body: ACCOUNTS }),
    'GET /api/categories': () => ({ body: CATEGORIES }),
    'GET /api/transactions': () => ({ body: list }),
    ...overrides,
  });
}

/** The query strings of every GET /api/transactions the page made, in order. */
function listQueries(): URLSearchParams[] {
  return vi
    .mocked(fetch)
    .mock.calls.map(([input]) => new URL(input as string, 'http://localhost'))
    .filter((url) => url.pathname === '/api/transactions')
    .map((url) => url.searchParams);
}

function lastListQuery(): Record<string, string> {
  const last = listQueries().at(-1);
  if (last === undefined) throw new Error('no transaction list request');
  return Object.fromEntries(last);
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

async function rows() {
  return screen.findAllByTestId('transaction-row');
}

async function row(index: number) {
  const found = (await rows())[index];
  if (found === undefined) throw new Error(`no row ${index}`);
  return found;
}

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Transactions list', () => {
  it('shows each row with its account, owner, category, memo, note and excluded flag', async () => {
    api();
    renderAt('/transactions');
    const first = await row(0);
    expect(within(first).getByText('Shop 1')).toBeInTheDocument();
    expect(within(first).getByText('A note')).toBeInTheDocument();
    expect(within(first).getByText('Tangerine Chequing')).toBeInTheDocument();
    expect(within(first).getByRole('combobox', { name: 'Owner' })).toHaveValue('1');
    // An archived category is shown when it is the row's own category.
    expect(within(first).getByRole('combobox', { name: 'Category' })).toHaveValue('9');
    const second = await row(1);
    expect(within(second).getByText('Coffee run')).toBeInTheDocument();
    expect(within(second).getByText('Excluded')).toBeInTheDocument();
    // ...and left out of other rows' pickers.
    expect(
      within(within(second).getByRole('combobox', { name: 'Category' })).queryByRole('option', {
        name: /Old stuff/,
      }),
    ).toBeNull();
    expect(within(await row(2)).getByText('None')).toBeInTheDocument();
    expect(screen.getAllByTestId('transaction-card')).toHaveLength(3);
  });

  it('reads the filters from the URL, shows them and sends them to the API', async () => {
    api();
    renderAt(
      '/transactions?owner=2&account=none&category=none&from=2026-09-01&to=2026-09-30&q=tim&minCents=-5000&excluded=false&sort=amount&order=asc&page=2&bogus=1',
    );
    await rows();
    expect(lastListQuery()).toEqual({
      owner: '2',
      account: 'none',
      category: 'none',
      from: '2026-09-01',
      to: '2026-09-30',
      q: 'tim',
      minCents: '-5000',
      excluded: 'false',
      sort: 'amount',
      order: 'asc',
      page: '2',
      pageSize: '50',
    });
    const filters = screen.getByRole('region', { name: 'Filters' });
    expect(within(filters).getByLabelText('Owner')).toHaveValue('2');
    expect(within(filters).getByLabelText('Account')).toHaveValue('none');
    expect(within(filters).getByLabelText('Category')).toHaveValue('none');
    expect(within(filters).getByLabelText('From')).toHaveValue('2026-09-01');
    expect(within(filters).getByLabelText('Search')).toHaveValue('tim');
    expect(within(filters).getByLabelText('Min amount')).toHaveValue('-50.00');
    expect(within(filters).getByLabelText('Show')).toHaveValue('false');
  });

  it('applies a select filter at once and goes back to page 1', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/transactions?page=3');
    await rows();
    const filters = screen.getByRole('region', { name: 'Filters' });
    await user.selectOptions(within(filters).getByLabelText('Account'), 'Tangerine Chequing');
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ account: '1', page: '1' });
    });
    await user.selectOptions(within(filters).getByLabelText('Category'), 'Coffee');
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ account: '1', category: '6' });
    });
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => {
      expect(lastListQuery()).toEqual({ sort: 'date', order: 'desc', page: '1', pageSize: '50' });
    });
  });

  it('applies the search and amount range on Enter, in cents', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/transactions');
    await rows();
    await user.type(screen.getByLabelText('Min amount'), '-100');
    await user.type(screen.getByLabelText('Max amount'), '-20.5');
    await user.type(screen.getByLabelText('Search'), '  Costco {Enter}');
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ q: 'Costco', minCents: '-10000', maxCents: '-2050' });
    });
  });

  it('refuses an amount that is not a number', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/transactions');
    await rows();
    const before = listQueries().length;
    await user.type(screen.getByLabelText('Min amount'), 'ten');
    await user.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Amounts must be numbers');
    expect(listQueries()).toHaveLength(before);
  });

  it('sorts by a column, then reverses it', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/transactions');
    await rows();
    await user.click(screen.getByRole('button', { name: 'Amount' }));
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ sort: 'amount', order: 'desc' });
    });
    await user.click(screen.getByRole('button', { name: 'Amount' }));
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ sort: 'amount', order: 'asc' });
    });
    expect(screen.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    await user.selectOptions(screen.getByLabelText('Sort'), 'Description, A to Z');
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ sort: 'description', order: 'asc' });
    });
  });

  it('pages through the results', async () => {
    api({}, { items: ITEMS, total: 120 });
    const user = userEvent.setup();
    renderAt('/transactions');
    await rows();
    expect(screen.getByTestId('range')).toHaveTextContent('1–50 of 120');
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ page: '2' });
    });
    expect(screen.getByTestId('range')).toHaveTextContent('51–100 of 120');
    await user.selectOptions(screen.getByLabelText('Rows per page'), '100 per page');
    await waitFor(() => {
      expect(lastListQuery()).toMatchObject({ page: '1', pageSize: '100' });
    });
  });

  it('folds the filters on phones until opened, showing how many are in use', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/transactions');
    await rows();
    const toggle = screen.getByRole('button', { name: 'Filters' });
    const panel = document.getElementById('transaction-filters');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Hidden below the sm breakpoint only; wider screens always show the panel.
    expect(panel).toHaveClass('hidden', 'sm:grid');
    expect(screen.getByLabelText('Min amount').closest('.hidden')).not.toBeNull();
    await user.click(toggle);
    expect(screen.getByRole('button', { name: 'Hide filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(panel).not.toHaveClass('hidden');
    expect(screen.getByLabelText('Min amount').closest('.hidden')).toBeNull();
  });

  it('starts with the filters open when some are in use', async () => {
    api();
    renderAt('/transactions?owner=2&from=2026-10-01&to=2026-10-31');
    await rows();
    expect(screen.getByRole('button', { name: 'Hide filters' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hide filters' }));
    expect(screen.getByRole('button', { name: 'Filters (3)' })).toBeInTheDocument();
  });

  it('says when no transaction matches', async () => {
    api({}, { items: [], total: 0 });
    renderAt('/transactions?q=nothing');
    expect(await screen.findByText('No transactions match these filters.')).toBeInTheDocument();
  });
});

describe('Transactions editing', () => {
  it('changes a row’s owner and category inline', async () => {
    const calls = api({
      'PATCH /api/transactions/2': ({ body }) => ({
        body: { ...transaction(2), ...(body as object) },
      }),
    });
    const user = userEvent.setup();
    renderAt('/transactions');
    const second = await row(1);
    await user.selectOptions(within(second).getByRole('combobox', { name: 'Owner' }), 'Joint');
    await user.selectOptions(within(second).getByRole('combobox', { name: 'Category' }), 'Coffee');
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'PATCH',
        path: '/api/transactions/2',
        body: { categoryId: 6 },
      });
    });
    expect(calls).toContainEqual({
      method: 'PATCH',
      path: '/api/transactions/2',
      body: { ownerId: 3 },
    });
  });

  it('shows the server’s error when an edit fails', async () => {
    api({
      'PATCH /api/transactions/2': () => ({
        status: 400,
        body: { error: { code: 'invalid_reference', message: 'Unknown owner id: 3' } },
      }),
    });
    const user = userEvent.setup();
    renderAt('/transactions');
    await user.selectOptions(
      within(await row(1)).getByRole('combobox', { name: 'Owner' }),
      'Joint',
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Unknown owner id: 3');
  });

  it('categorizes the selected rows in bulk', async () => {
    const calls = api({
      'POST /api/transactions/bulk': () => ({ body: { changed: 2 } }),
    });
    const user = userEvent.setup();
    renderAt('/transactions');
    await user.click(within(await row(1)).getByRole('checkbox', { name: 'Select Shop 2' }));
    await user.click(within(await row(2)).getByRole('checkbox', { name: 'Select Shop 3' }));
    const bar = screen.getByRole('region', { name: 'Bulk actions' });
    expect(within(bar).getByTestId('selected-count')).toHaveTextContent('2 selected');
    await user.selectOptions(within(bar).getByLabelText('Set category of selected'), 'Groceries');
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/transactions/bulk',
        body: { ids: [2, 3], patch: { categoryId: 4 } },
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Updated 2 of 2 selected transactions.',
    );
    expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
  });

  it('selects every row on the page and excludes them', async () => {
    const calls = api({
      'POST /api/transactions/bulk': () => ({ body: { changed: 3 } }),
    });
    const user = userEvent.setup();
    renderAt('/transactions');
    await rows();
    await user.click(screen.getByRole('checkbox', { name: 'Select all on this page' }));
    await user.click(screen.getByRole('button', { name: 'Exclude' }));
    await waitFor(() => {
      expect(calls).toContainEqual({
        method: 'POST',
        path: '/api/transactions/bulk',
        body: { ids: [1, 2, 3], patch: { excluded: true } },
      });
    });
  });

  it('clears the selection when the filters change', async () => {
    api();
    const user = userEvent.setup();
    renderAt('/transactions');
    await user.click(within(await row(0)).getByRole('checkbox', { name: 'Select Shop 1' }));
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Owner', { selector: 'select[id]' }), 'Emily');
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Bulk actions' })).toBeNull();
    });
  });
});
