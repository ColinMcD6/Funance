import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS } from '@/test-utils/mock-api';

const WALMART_MAPPING = {
  encoding: 'utf-8',
  hasHeader: true,
  columns: {
    date: 'Date',
    postedDate: 'Posted Date',
    description: ['Merchant Name'],
    amount: 'Amount',
    externalId: 'Reference Number',
    bankCategory: 'Merchant Category',
    ownerHint: 'Name on Card',
  },
  dateFormat: 'yyyy-MM-dd',
  amountSign: 'positive_is_outflow',
  ownerHintMap: {},
  skipZeroAmount: false,
  skipWhen: [{ column: 'Status', notEquals: 'APPROVED' }],
};

const PRESETS = [
  {
    id: 'walmart-mastercard',
    label: 'Walmart Mastercard',
    institution: 'walmart',
    type: 'credit_card',
    mapping: WALMART_MAPPING,
  },
];

const ACCOUNT = {
  id: 4,
  name: 'Walmart Mastercard',
  institution: 'walmart',
  type: 'credit_card',
  defaultOwnerId: 3,
  csvMapping: WALMART_MAPPING,
  archived: false,
  createdAt: '2026-11-20T12:00:00.000Z',
};

function api(overrides = {}) {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/accounts': () => ({ body: [ACCOUNT] }),
    'GET /api/csv-presets': () => ({ body: PRESETS }),
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

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Settings', () => {
  it('renames an owner', async () => {
    const calls = api({
      'PATCH /api/owners/2': () => ({ body: { ...OWNERS[1], name: 'Em' } }),
    });
    const user = userEvent.setup();
    renderAt('/settings');
    const input = await screen.findByRole('textbox', { name: 'Name of Emily (person)' });
    await user.clear(input);
    await user.type(input, 'Em');
    const row = input.closest('form');
    if (row === null) throw new Error('no form');
    await user.click(within(row).getByRole('button', { name: 'Save' }));
    expect(calls).toContainEqual({ method: 'PATCH', path: '/api/owners/2', body: { name: 'Em' } });
  });

  it('archives an account', async () => {
    const calls = api({
      'PATCH /api/accounts/4': () => ({ body: { ...ACCOUNT, archived: true } }),
    });
    const user = userEvent.setup();
    renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: 'Archive Walmart Mastercard' }));
    expect(calls).toContainEqual({
      method: 'PATCH',
      path: '/api/accounts/4',
      body: { archived: true },
    });
  });

  it('creates an account from a preset with two owner hints', async () => {
    const calls = api({
      'POST /api/accounts': () => ({ status: 201, body: { ...ACCOUNT, id: 9 } }),
    });
    const user = userEvent.setup();
    renderAt('/settings/accounts/new');
    await user.selectOptions(await screen.findByLabelText('Preset'), 'walmart-mastercard');
    expect(screen.getByLabelText('Owner hint column')).toHaveValue('Name on Card');
    expect(screen.getByLabelText('Institution')).toHaveValue('walmart');

    await user.type(screen.getByLabelText('Name'), 'Walmart (new)');
    await user.selectOptions(screen.getByLabelText('Default owner'), '3');
    await user.click(screen.getByRole('button', { name: 'Add owner hint' }));
    await user.type(screen.getByLabelText('Owner hint 1 value'), 'ALEX SAMPLE');
    await user.selectOptions(screen.getByLabelText('Owner hint 1 owner'), '1');
    await user.click(screen.getByRole('button', { name: 'Add owner hint' }));
    await user.type(screen.getByLabelText('Owner hint 2 value'), 'JAMIE SAMPLE');
    await user.selectOptions(screen.getByLabelText('Owner hint 2 owner'), '2');
    await user.click(screen.getByRole('button', { name: 'Create account' }));

    expect(calls).toContainEqual({
      method: 'POST',
      path: '/api/accounts',
      body: {
        name: 'Walmart (new)',
        institution: 'walmart',
        type: 'credit_card',
        defaultOwnerId: 3,
        csvMapping: { ...WALMART_MAPPING, ownerHintMap: { 'ALEX SAMPLE': 1, 'JAMIE SAMPLE': 2 } },
      },
    });
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('lists form errors and does not submit an incomplete account', async () => {
    const calls = api();
    const user = userEvent.setup();
    renderAt('/settings/accounts/new');
    await user.click(await screen.findByRole('button', { name: 'Create account' }));
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Enter a name');
    expect(alert).toHaveTextContent('Choose a default owner');
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('shows the server error when saving fails', async () => {
    api({
      'PATCH /api/accounts/4': () => ({
        status: 409,
        body: { error: { code: 'conflict', message: 'An account named "RBC" already exists' } },
      }),
    });
    const user = userEvent.setup();
    renderAt('/settings/accounts/4');
    const name = await screen.findByLabelText('Name');
    expect(name).toHaveValue('Walmart Mastercard');
    await user.clear(name);
    await user.type(name, 'RBC');
    await user.click(screen.getByRole('button', { name: 'Save account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'An account named "RBC" already exists',
    );
  });

  it('says so when the account id is unknown', async () => {
    api();
    renderAt('/settings/accounts/77');
    expect(await screen.findByText('No account with id 77.')).toBeInTheDocument();
  });
});

describe('Settings backups', () => {
  it('takes a backup now and offers the newest for download', async () => {
    const calls = api({
      'POST /api/backup': () => ({
        status: 201,
        body: {
          filename: 'finance-20261120-120000.sqlite',
          createdAt: '2026-11-20T12:00:00.000Z',
          sizeBytes: 204800,
        },
      }),
    });
    const user = userEvent.setup();
    renderAt('/settings');
    const download = await screen.findByRole('link', { name: 'Download latest backup' });
    expect(download).toHaveAttribute('href', '/api/backup/latest');
    expect(download).toHaveAttribute('download');

    await user.click(screen.getByRole('button', { name: 'Back up now' }));
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Saved finance-20261120-120000.sqlite (200 KB).',
    );
    expect(calls).toContainEqual({ method: 'POST', path: '/api/backup', body: undefined });
  });

  it('shows why a backup failed', async () => {
    api({
      'POST /api/backup': () => ({
        status: 409,
        body: { error: { code: 'backups_disabled', message: 'Backups are not configured' } },
      }),
    });
    const user = userEvent.setup();
    renderAt('/settings');
    await user.click(await screen.findByRole('button', { name: 'Back up now' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Backups are not configured');
  });
});
