import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS, type MockCall } from '@/test-utils/mock-api';

const CATEGORIES = [
  {
    id: 4,
    name: 'Groceries',
    kind: 'expense',
    color: '#16a34a',
    sortOrder: 1,
    archived: false,
    groupName: 'Groceries',
  },
  {
    id: 27,
    name: 'Card Payment',
    kind: 'transfer',
    color: '#64748b',
    sortOrder: 2,
    archived: false,
    groupName: 'Transfers',
  },
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

function rule(id: number, priority: number, pattern: string, fields: object = {}) {
  return {
    id,
    priority,
    matchField: 'description',
    matchType: 'contains',
    pattern,
    accountId: null,
    direction: null,
    setCategoryId: 27,
    setOwnerId: null,
    enabled: true,
    createdAt: '2026-11-20T12:00:00.000Z',
    ...fields,
  };
}

const RULES = [
  rule(1, 10, 'PAYMENT - THANK YOU'),
  rule(2, 20, 'PAYMENT THANK YOU', { accountId: 2, direction: 'inflow', setOwnerId: 3 }),
  rule(3, 30, 'Credit Card Payment', { enabled: false }),
];

function transaction(id: number, description: string) {
  return {
    id,
    accountId: 2,
    importId: 1,
    ownerId: 1,
    categoryId: null,
    categorySource: null,
    ruleId: null,
    date: '2026-10-30',
    postedDate: null,
    amountCents: -20411,
    description,
    memo: null,
    merchantKey: 'COSTCO',
    bankCategory: null,
    externalId: null,
    dedupKey: `key-${id}`,
    occurrence: 1,
    notes: null,
    excluded: false,
    rawRow: {},
    createdAt: '2026-11-20T12:00:00.000Z',
    updatedAt: '2026-11-20T12:00:00.000Z',
  };
}

function api(overrides: Parameters<typeof mockApi>[0] = {}): MockCall[] {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/accounts': () => ({ body: ACCOUNTS }),
    'GET /api/categories': () => ({ body: CATEGORIES }),
    'GET /api/rules': () => ({ body: RULES }),
    'POST /api/rules/test': () => ({
      body: { matchCount: 5, samples: [transaction(1, 'COSTCO WHOLESALE W1234')] },
    }),
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

const saves = (calls: MockCall[]) =>
  calls.filter((c) => c.method !== 'GET' && c.path !== '/api/rules/test');

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Rules page', () => {
  it('lists rules by priority with their condition, category and limits', async () => {
    api();
    renderAt('/rules');
    const rows = await screen.findAllByTestId('rule-row');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Description contains “PAYMENT - THANK YOU”→Card Payment');
    await waitFor(() => {
      expect(rows[1]).toHaveTextContent(
        'Only Tangerine Mastercard · Inflows only · Sets owner Joint',
      );
    });
    expect(rows[2]).toHaveTextContent('Disabled');
  });

  it('creates a rule after the last one, with a live match preview', async () => {
    const calls = api({
      'POST /api/rules': ({ body }) => ({
        status: 201,
        body: { id: 9, createdAt: '2026-11-20T12:00:00.000Z', ...(body as object) },
      }),
    });
    const user = userEvent.setup();
    renderAt('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const form = screen.getByRole('form', { name: 'New rule' });
    expect(within(form).getByText(/Type a pattern/)).toBeInTheDocument();
    await user.type(within(form).getByLabelText('Pattern'), 'COSTCO');
    expect(await within(form).findByTestId('rule-match-count')).toHaveTextContent(
      'Matches 5 transactions',
    );
    expect(within(form).getByText('COSTCO WHOLESALE W1234')).toBeInTheDocument();
    const test = calls.filter((c) => c.path === '/api/rules/test').at(-1);
    expect(test?.body).toMatchObject({ pattern: 'COSTCO', matchType: 'contains' });

    expect(within(form).getByRole('button', { name: 'Create rule' })).toBeDisabled();
    await user.selectOptions(within(form).getByLabelText('Set category'), 'Groceries');
    await user.click(within(form).getByRole('button', { name: 'Create rule' }));
    await waitFor(() => {
      expect(saves(calls)).toEqual([
        {
          method: 'POST',
          path: '/api/rules',
          body: {
            priority: 40,
            matchField: 'description',
            matchType: 'contains',
            pattern: 'COSTCO',
            setCategoryId: 4,
            accountId: null,
            direction: null,
            setOwnerId: null,
            enabled: true,
          },
        },
      ]);
    });
  });

  it('shows the server’s error for an invalid regex in the preview', async () => {
    api({
      'POST /api/rules/test': () => ({
        status: 400,
        body: {
          error: { code: 'invalid_pattern', message: 'Invalid pattern: Unterminated group' },
        },
      }),
    });
    const user = userEvent.setup();
    renderAt('/rules');
    await user.click(await screen.findByRole('button', { name: 'New rule' }));
    const form = screen.getByRole('form', { name: 'New rule' });
    await user.selectOptions(within(form).getByLabelText('Match'), 'regex');
    await user.type(within(form).getByLabelText('Pattern'), '(COSTCO');
    expect(await within(form).findByRole('alert')).toHaveTextContent('Invalid pattern');
  });

  it('edits a rule, keeping its priority', async () => {
    const calls = api({
      'PATCH /api/rules/2': ({ body }) => ({ body: { ...RULES[1], ...(body as object) } }),
    });
    const user = userEvent.setup();
    renderAt('/rules');
    await user.click(
      await screen.findByRole('button', {
        name: 'Edit rule Description contains “PAYMENT THANK YOU”',
      }),
    );
    const form = screen.getByRole('form', { name: 'Edit rule' });
    expect(within(form).getByLabelText('Only for account')).toHaveValue('2');
    expect(within(form).getByLabelText('Direction')).toHaveValue('inflow');
    await user.selectOptions(within(form).getByLabelText('Direction'), '');
    await user.click(within(form).getByRole('button', { name: 'Save rule' }));
    await waitFor(() => {
      expect(saves(calls)).toEqual([
        {
          method: 'PATCH',
          path: '/api/rules/2',
          body: expect.objectContaining({ priority: 20, direction: null, accountId: 2 }) as unknown,
        },
      ]);
    });
  });

  it('enables, reorders and deletes', async () => {
    const calls = api({
      'PATCH /api/rules/3': () => ({ body: RULES[2] }),
      'PATCH /api/rules/2': () => ({ body: RULES[1] }),
      'DELETE /api/rules/1': () => ({ body: { deletedId: 1 } }),
    });
    const user = userEvent.setup();
    renderAt('/rules');
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Enable rule Description contains “Credit Card Payment”',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Move rule Description contains “Credit Card Payment” up',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Delete rule Description contains “PAYMENT - THANK YOU”',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Delete rule' }));
    await waitFor(() => {
      expect(saves(calls)).toEqual([
        { method: 'PATCH', path: '/api/rules/3', body: { enabled: true } },
        { method: 'PATCH', path: '/api/rules/3', body: { priority: 20 } },
        { method: 'PATCH', path: '/api/rules/2', body: { priority: 30 } },
        { method: 'DELETE', path: '/api/rules/1', body: undefined },
      ]);
    });
  });

  it('applies the rules now and says how many changed', async () => {
    const calls = api({ 'POST /api/rules/apply': () => ({ body: { changed: 7 } }) });
    const user = userEvent.setup();
    renderAt('/rules');
    await user.click(await screen.findByRole('button', { name: 'Apply rules now' }));
    expect(await screen.findByTestId('apply-result')).toHaveTextContent(
      'Rules changed 7 transactions.',
    );
    expect(saves(calls)).toEqual([{ method: 'POST', path: '/api/rules/apply', body: undefined }]);
  });
});
