import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS, type MockCall } from '@/test-utils/mock-api';

const category = (id: number, name: string, groupName: string) => ({
  id,
  name,
  kind: 'expense',
  color: '#16a34a',
  sortOrder: id,
  archived: false,
  groupName,
});

const CATEGORIES = [
  category(4, 'Groceries', 'Groceries'),
  category(5, 'Home', 'Housing'),
  category(9, 'Transportation (Other)', 'Transportation'),
];

const ACCOUNTS = [
  {
    id: 2,
    name: 'Tangerine Mastercard',
    institution: 'tangerine',
    type: 'credit_card',
    defaultOwnerId: 1,
    csvMapping: {
      encoding: 'utf-8',
      hasHeader: true,
      columns: { date: 'Date', description: ['Name'], amount: 'Amount' },
      dateFormat: 'MM/dd/yyyy',
      amountSign: 'negative_is_outflow',
      skipZeroAmount: false,
    },
    archived: false,
    createdAt: '2026-11-20T12:00:00.000Z',
  },
];

type Row = { id: number; categoryId: number | null; ownerId: number };

function transaction(
  id: number,
  date: string,
  description: string,
  merchantKey: string,
  suggestedCategoryId: number | null,
) {
  return {
    id,
    accountId: 2,
    importId: 1,
    ownerId: 1,
    categoryId: null as number | null,
    categorySource: null,
    ruleId: null,
    date,
    postedDate: null,
    amountCents: -1234,
    description,
    memo: null,
    merchantKey,
    bankCategory: null,
    externalId: null,
    dedupKey: `key-${String(id)}`,
    occurrence: 1,
    notes: null,
    excluded: false,
    rawRow: {},
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
    suggestedCategoryId,
  };
}

/** Oldest first, as the server sorts the queue. */
const QUEUE = () => [
  transaction(1, '2026-10-01', 'WAL-MART #3177 WINNIPEG MB', 'WAL-MART WINNIPEG MB', 4),
  transaction(2, '2026-10-02', 'UBER TRIP', 'UBER TRIP', 9),
  transaction(3, '2026-10-03', 'WAL-MART #3177 WINNIPEG MB', 'WAL-MART WINNIPEG MB', 4),
  transaction(4, '2026-10-04', 'CANADIAN TIRE #0233 WINNIPEG MB', 'CANADIAN TIRE WINNIPEG', null),
  transaction(5, '2026-10-05', 'UBER TRIP', 'UBER TRIP', 9),
];

/** A fake server: GET lists the still-uncategorized rows; PATCH and bulk edit them. */
function api(rows = QUEUE(), overrides: Parameters<typeof mockApi>[0] = {}): MockCall[] {
  const edit = (id: number, patch: Partial<Row>) => {
    const row = rows.find((r) => r.id === id);
    if (row !== undefined) Object.assign(row, patch);
    return row;
  };
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/accounts': () => ({ body: ACCOUNTS }),
    'GET /api/categories': () => ({ body: CATEGORIES }),
    'GET /api/rules': () => ({ body: [] }),
    'GET /api/transactions': () => {
      const items = rows.filter((r) => r.categoryId === null);
      return { body: { items, total: items.length } };
    },
    'POST /api/transactions/bulk': ({ body }) => {
      const { ids, patch } = body as { ids: number[]; patch: Partial<Row> };
      for (const id of ids) edit(id, patch);
      return { body: { changed: ids.length } };
    },
    'POST /api/rules/test': () => ({ body: { matchCount: 2, samples: [] } }),
    ...Object.fromEntries(
      rows.map((r) => [
        `PATCH /api/transactions/${String(r.id)}`,
        ({ body }: MockCall) => ({ body: edit(r.id, body as Partial<Row>) }),
      ]),
    ),
    ...overrides,
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

const edits = (calls: MockCall[]) =>
  calls.filter((c) => c.method !== 'GET' && c.path !== '/api/rules/test');

const queueRows = () => screen.getAllByTestId('queue-row');
const sidebarBadge = () => {
  const [sidebar] = screen.getAllByRole('navigation', { name: 'Main' });
  if (sidebar === undefined) throw new Error('no navigation');
  return within(sidebar).queryByTestId('uncategorized-badge');
};

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Uncategorized page', () => {
  it('lists the queue oldest first, grouped by merchant, with the count and a badge', async () => {
    api();
    renderAt('/uncategorized');
    expect(await screen.findByTestId('queue-count')).toHaveTextContent('5 to categorize');
    await waitFor(() => {
      expect(sidebarBadge()).toHaveTextContent('5');
    });
    const groups = screen.getAllByTestId('merchant-group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual([
      'WAL-MART WINNIPEG MB',
      'UBER TRIP',
      'CANADIAN TIRE WINNIPEG',
    ]);
    const [walmart, uber, tire] = groups;
    if (walmart === undefined || uber === undefined || tire === undefined) throw new Error();
    expect(within(walmart).getAllByTestId('queue-row')).toHaveLength(2);
    expect(within(walmart).getByText(/· 2 transactions/)).toBeInTheDocument();
    expect(
      await within(walmart).findByRole('button', { name: 'Accept Groceries for all 2' }),
    ).toBeInTheDocument();
    expect(
      within(uber).getAllByRole('button', { name: 'Accept Transportation (Other)' }),
    ).toHaveLength(2);
    // No suggestion, a single row: a picker and no group controls.
    expect(within(tire).getByTestId('no-suggestion')).toBeInTheDocument();
    expect(within(tire).queryByRole('combobox', { name: /Category for all/ })).toBeNull();
  });

  it('accepting a suggestion records it as a suggestion and the row leaves the queue', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/uncategorized');
    const uber = await screen.findByRole('region', { name: 'UBER TRIP' });
    const [first] = await within(uber).findAllByRole('button', {
      name: 'Accept Transportation (Other)',
    });
    if (first === undefined) throw new Error();
    await user.click(first);
    expect(edits(calls)).toEqual([
      {
        method: 'PATCH',
        path: '/api/transactions/2',
        body: { categoryId: 9, categorySource: 'suggestion' },
      },
    ]);
    await waitFor(() => {
      expect(queueRows()).toHaveLength(4);
    });
    expect(screen.getByTestId('queue-count')).toHaveTextContent('4 to categorize');
    await waitFor(() => {
      expect(sidebarBadge()).toHaveTextContent('4');
    });
    // Accepting a suggestion does not offer a rule.
    expect(screen.queryByRole('region', { name: 'Create a rule' })).toBeNull();
  });

  it('accepts a whole merchant group in one bulk request', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/uncategorized');
    await user.click(await screen.findByRole('button', { name: 'Accept Groceries for all 2' }));
    expect(edits(calls)).toEqual([
      {
        method: 'POST',
        path: '/api/transactions/bulk',
        body: { ids: [1, 3], patch: { categoryId: 4, categorySource: 'suggestion' } },
      },
    ]);
    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'WAL-MART WINNIPEG MB' })).toBeNull();
    });
  });

  it('a manual pick is recorded as manual and offers a rule, which it creates and applies', async () => {
    const calls = api(QUEUE(), {
      'POST /api/rules': ({ body }) => ({
        status: 201,
        body: { id: 7, createdAt: '2026-11-20T12:00:00.000Z', ...(body as object) },
      }),
      'POST /api/rules/apply': () => ({ body: { changed: 1 } }),
    });
    const user = userEvent.setup();
    renderAt('/uncategorized');
    const walmart = await screen.findByRole('region', { name: 'WAL-MART WINNIPEG MB' });
    const [picker] = within(walmart).getAllByRole('combobox', { name: 'Category' });
    if (picker === undefined) throw new Error();
    await user.selectOptions(picker, 'Home');
    expect(edits(calls)).toEqual([
      { method: 'PATCH', path: '/api/transactions/1', body: { categoryId: 5 } },
    ]);

    const prompt = await screen.findByRole('region', { name: 'Create a rule' });
    expect(within(prompt).getByTestId('rule-question')).toHaveTextContent(
      'Always categorize WAL-MART as Home?',
    );
    expect(within(prompt).getByLabelText('Description contains')).toHaveValue('WAL-MART');
    expect(await within(prompt).findByText(/Matches 2 transactions/)).toBeInTheDocument();
    const test = calls.filter((c) => c.path === '/api/rules/test').at(-1);
    expect(test?.body).toMatchObject({ pattern: 'WAL-MART', setCategoryId: 5 });

    await user.click(within(prompt).getByRole('button', { name: 'Create rule' }));
    expect(await screen.findByTestId('queue-message')).toHaveTextContent(
      'Created the rule “WAL-MART” → Home. It categorized 1 more transaction.',
    );
    expect(edits(calls).slice(1)).toEqual([
      {
        method: 'POST',
        path: '/api/rules',
        body: {
          priority: 10,
          matchField: 'description',
          matchType: 'contains',
          pattern: 'WAL-MART',
          setCategoryId: 5,
          accountId: null,
          direction: null,
          setOwnerId: null,
          enabled: true,
        },
      },
      { method: 'POST', path: '/api/rules/apply', body: undefined },
    ]);
    expect(screen.queryByRole('region', { name: 'Create a rule' })).toBeNull();
  });

  it('the rule pattern can be edited, and "Not now" creates nothing', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/uncategorized');
    const tire = await screen.findByRole('region', { name: 'CANADIAN TIRE WINNIPEG' });
    await user.selectOptions(within(tire).getByRole('combobox', { name: 'Category' }), 'Home');
    const prompt = await screen.findByRole('region', { name: 'Create a rule' });
    const pattern = within(prompt).getByLabelText('Description contains');
    expect(pattern).toHaveValue('CANADIAN TIRE');
    await user.clear(pattern);
    await user.type(pattern, 'CDN TIRE');
    expect(within(prompt).getByTestId('rule-question')).toHaveTextContent(
      'Always categorize CDN TIRE as Home?',
    );
    await user.click(within(prompt).getByRole('button', { name: 'Not now' }));
    expect(screen.queryByRole('region', { name: 'Create a rule' })).toBeNull();
    expect(edits(calls).map((c) => c.path)).toEqual(['/api/transactions/4']);
  });

  it('setting a whole group by hand is one bulk request and offers a rule', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/uncategorized');
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Category for all UBER TRIP' }),
      'Groceries',
    );
    expect(edits(calls)).toEqual([
      {
        method: 'POST',
        path: '/api/transactions/bulk',
        body: { ids: [2, 5], patch: { categoryId: 4 } },
      },
    ]);
    expect(
      within(await screen.findByRole('region', { name: 'Create a rule' })).getByTestId(
        'rule-question',
      ),
    ).toHaveTextContent('Always categorize UBER TRIP as Groceries?');
  });

  it('changes a row’s owner from the queue', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/uncategorized');
    const tire = await screen.findByRole('region', { name: 'CANADIAN TIRE WINNIPEG' });
    await user.selectOptions(within(tire).getByRole('combobox', { name: 'Owner' }), 'Joint');
    expect(edits(calls)).toEqual([
      { method: 'PATCH', path: '/api/transactions/4', body: { ownerId: 3 } },
    ]);
  });

  it('moves through the queue and accepts with the keyboard', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/uncategorized');
    await screen.findAllByRole('button', { name: 'Accept Groceries' });
    // The first row is active to start with.
    expect(queueRows()[0]).toHaveAttribute('aria-current', 'true');
    await user.keyboard('j');
    expect(queueRows()[1]).toHaveAttribute('aria-current', 'true');
    expect(queueRows()[1]).toHaveFocus();
    await user.keyboard('{ArrowDown}k');
    expect(queueRows()[1]).toHaveAttribute('aria-current', 'true');

    // Rows are in group order: Wal-Mart 1, 3, then Uber 2, 5, then Canadian Tire 4.
    await user.keyboard('a');
    expect(edits(calls)).toEqual([
      {
        method: 'PATCH',
        path: '/api/transactions/3',
        body: { categoryId: 4, categorySource: 'suggestion' },
      },
    ]);
    // The row in its place (Uber 2) becomes active and takes focus.
    await waitFor(() => {
      expect(queueRows()[1]).toHaveAttribute('data-row-id', '2');
    });
    expect(queueRows()[1]).toHaveAttribute('aria-current', 'true');
    await waitFor(() => {
      expect(queueRows()[1]).toHaveFocus();
    });

    await user.keyboard('g');
    expect(edits(calls).at(-1)).toEqual({
      method: 'POST',
      path: '/api/transactions/bulk',
      body: { ids: [2, 5], patch: { categoryId: 9, categorySource: 'suggestion' } },
    });
    await waitFor(() => {
      expect(queueRows()).toHaveLength(2);
    });

    // C opens the picker of the active row (Canadian Tire, now at the same position).
    await user.keyboard('c');
    const active = queueRows()[1];
    if (active === undefined) throw new Error();
    expect(active).toHaveAttribute('data-row-id', '4');
    expect(within(active).getByRole('combobox', { name: 'Category' })).toHaveFocus();
    // Typing in the picker is not a shortcut.
    await user.keyboard('a');
    expect(edits(calls)).toHaveLength(2);
  });

  it('shows an empty queue and no badge when everything is categorized', async () => {
    api([]);
    renderAt('/uncategorized');
    expect(await screen.findByTestId('queue-empty')).toHaveTextContent('Nothing to categorize');
    expect(screen.getByTestId('queue-count')).toHaveTextContent('0 to categorize');
    expect(sidebarBadge()).toBeNull();
    expect(screen.queryByTestId('shortcut-help')).toBeNull();
  });
});
