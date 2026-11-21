import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { mockApi, OWNERS } from '@/test-utils/mock-api';

function clearCookie() {
  document.cookie = 'profile=; path=/; max-age=0';
}

function renderApp(path = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <App
      queryClient={queryClient}
      router={(routes: RouteObject[]) => createMemoryRouter(routes, { initialEntries: [path] })}
    />,
  );
}

const handlers = {
  'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
  'GET /api/owners': () => ({ body: OWNERS }),
  'GET /api/accounts': () => ({ body: [] }),
  'POST /api/session': ({ body }: { body: unknown }) => {
    const { ownerId } = body as { ownerId: number };
    return { body: { owner: OWNERS.find((o) => o.id === ownerId) } };
  },
  'DELETE /api/session': () => ({ body: { owner: null } }),
};

beforeEach(clearCookie);
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  clearCookie();
});

describe('App profile gate', () => {
  it('shows the picker with only the people when no profile is set', async () => {
    mockApi(handlers);
    renderApp();
    expect(screen.getByRole('heading', { name: 'Finance Tracker' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Colin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Emily' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Joint' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('health-status')).toHaveTextContent('ok');
  });

  it('opens the shell after choosing a profile, then switches and signs out', async () => {
    const calls = mockApi(handlers);
    const user = userEvent.setup();
    renderApp();
    await user.click(await screen.findByRole('button', { name: 'Emily' }));
    expect(calls).toContainEqual({ method: 'POST', path: '/api/session', body: { ownerId: 2 } });

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    const switcher = screen.getByRole('combobox', { name: 'Active profile' });
    expect(switcher).toHaveValue('2');

    await user.selectOptions(switcher, '1');
    expect(calls).toContainEqual({ method: 'POST', path: '/api/session', body: { ownerId: 1 } });
    expect(await screen.findByRole('combobox', { name: 'Active profile' })).toHaveValue('1');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Active profile' }), 'sign-out');
    expect(await screen.findByRole('button', { name: 'Colin' })).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'DELETE' && c.path === '/api/session')).toBe(true);
  });

  it('skips the picker when the cookie names a person', async () => {
    document.cookie = 'profile=1; path=/';
    mockApi(handlers);
    renderApp('/settings');
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the picker when the cookie names the joint owner', async () => {
    document.cookie = 'profile=3; path=/';
    mockApi(handlers);
    renderApp();
    expect(await screen.findByRole('button', { name: 'Colin' })).toBeInTheDocument();
  });

  it('shows an error when profiles cannot load', async () => {
    mockApi({
      ...handlers,
      'GET /api/owners': () => ({
        status: 500,
        body: { error: { code: 'internal', message: 'Internal server error' } },
      }),
    });
    renderApp();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load profiles: Internal server error',
    );
  });
});

describe('App navigation', () => {
  it('links every main page from the navigation', async () => {
    document.cookie = 'profile=1; path=/';
    mockApi(handlers);
    const user = userEvent.setup();
    renderApp();
    await screen.findByRole('heading', { name: 'Dashboard' });
    const [sidebar] = screen.getAllByRole('navigation', { name: 'Main' });
    if (sidebar === undefined) throw new Error('no navigation');
    const names = within(sidebar)
      .getAllByRole('link')
      .map((l) => l.textContent);
    expect(names).toEqual([
      'Dashboard',
      'Transactions',
      'Uncategorized',
      'Import',
      'Rules',
      'Categories',
      'Settings',
    ]);
    await user.click(within(sidebar).getByRole('link', { name: 'Rules' }));
    expect(await screen.findByRole('heading', { name: 'Rules' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'Rules' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
