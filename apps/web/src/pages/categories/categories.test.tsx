import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS, type MockCall } from '@/test-utils/mock-api';

function category(
  id: number,
  name: string,
  groupName: string,
  sortOrder: number,
  archived = false,
) {
  return { id, name, kind: 'expense', color: '#16a34a', sortOrder, archived, groupName };
}

const CATEGORIES = [
  category(4, 'Groceries', 'Groceries', 1),
  category(6, 'Coffee', 'Joy', 2),
  category(7, 'Eating out', 'Joy', 3),
  category(9, 'Old stuff', 'Joy', 4, true),
];

function api(overrides: Parameters<typeof mockApi>[0] = {}): MockCall[] {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/categories': () => ({ body: CATEGORIES }),
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

const writes = (calls: MockCall[]) => calls.filter((c) => c.method !== 'GET');

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Categories page', () => {
  it('lists active categories in order, and archived ones apart', async () => {
    api();
    renderAt('/categories');
    const list = await screen.findByRole('list', { name: 'Categories' });
    await waitFor(() => {
      expect(within(list).getAllByTestId('category-row')).toHaveLength(3);
    });
    expect(
      within(list)
        .getAllByTestId('category-row')
        .map((r) => r.textContent),
    ).toEqual([
      expect.stringContaining('Groceries'),
      expect.stringContaining('Coffee'),
      expect.stringContaining('Eating out'),
    ]);
    const archived = screen.getByRole('list', { name: 'Archived categories' });
    expect(within(archived).getByText('Old stuff')).toBeInTheDocument();
    expect(within(archived).getByRole('button', { name: 'Restore Old stuff' })).toBeEnabled();
  });

  it('creates a category with name, kind, color and group', async () => {
    const calls = api({
      'POST /api/categories': ({ body }) => ({
        status: 201,
        body: { id: 20, sortOrder: 5, archived: false, ...(body as object) },
      }),
    });
    const user = userEvent.setup();
    renderAt('/categories');
    await user.click(await screen.findByRole('button', { name: 'New category' }));
    const form = screen.getByRole('form', { name: 'New category' });
    await user.type(within(form).getByLabelText('Name'), '  Pet food ');
    await user.type(within(form).getByLabelText('Major category'), 'Pet');
    await user.selectOptions(within(form).getByLabelText('Kind'), 'savings');
    await user.click(within(form).getByRole('button', { name: 'Create' }));
    await waitFor(() => {
      expect(writes(calls)).toEqual([
        {
          method: 'POST',
          path: '/api/categories',
          body: { name: 'Pet food', kind: 'savings', color: '#64748b', groupName: 'Pet' },
        },
      ]);
    });
    await waitFor(() => {
      expect(screen.queryByRole('form', { name: 'New category' })).not.toBeInTheDocument();
    });
  });

  it('shows a 409 from the server', async () => {
    api({
      'POST /api/categories': () => ({
        status: 409,
        body: { error: { code: 'conflict', message: 'A category named "Coffee" already exists' } },
      }),
    });
    const user = userEvent.setup();
    renderAt('/categories');
    await user.click(await screen.findByRole('button', { name: 'New category' }));
    const form = screen.getByRole('form', { name: 'New category' });
    await user.type(within(form).getByLabelText('Name'), 'coffee');
    await user.type(within(form).getByLabelText('Major category'), 'Joy');
    await user.click(within(form).getByRole('button', { name: 'Create' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('already exists');
  });

  it('renames and changes kind', async () => {
    const calls = api({
      'PATCH /api/categories/6': ({ body }) => ({
        body: { ...CATEGORIES[1], ...(body as object) },
      }),
    });
    const user = userEvent.setup();
    renderAt('/categories');
    await user.click(await screen.findByRole('button', { name: 'Edit Coffee' }));
    const form = screen.getByRole('form', { name: 'Edit Coffee' });
    const name = within(form).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Cafés');
    await user.selectOptions(within(form).getByLabelText('Kind'), 'transfer');
    await user.click(within(form).getByRole('button', { name: 'Save' }));
    await waitFor(() => {
      expect(writes(calls)).toEqual([
        {
          method: 'PATCH',
          path: '/api/categories/6',
          body: { name: 'Cafés', kind: 'transfer', color: '#16a34a', groupName: 'Joy' },
        },
      ]);
    });
  });

  it('moves a category up by swapping sort orders, and disables moves past the ends', async () => {
    const calls = api({
      'PATCH /api/categories/6': () => ({ body: { ...CATEGORIES[1], sortOrder: 1 } }),
      'PATCH /api/categories/4': () => ({ body: { ...CATEGORIES[0], sortOrder: 2 } }),
    });
    const user = userEvent.setup();
    renderAt('/categories');
    expect(await screen.findByRole('button', { name: 'Move Groceries up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Eating out down' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Move Coffee up' }));
    await waitFor(() => {
      expect(writes(calls)).toEqual([
        { method: 'PATCH', path: '/api/categories/6', body: { sortOrder: 1 } },
        { method: 'PATCH', path: '/api/categories/4', body: { sortOrder: 2 } },
      ]);
    });
  });

  it('archives with reassignment, offering only active categories as targets', async () => {
    const calls = api({
      'DELETE /api/categories/6': () => ({ body: { ...CATEGORIES[1], archived: true } }),
    });
    const user = userEvent.setup();
    renderAt('/categories');
    await user.click(await screen.findByRole('button', { name: 'Archive Coffee' }));
    const form = screen.getByRole('form', { name: 'Archive Coffee' });
    const target = within(form).getByLabelText('Move its transactions and rules to');
    expect(within(target).queryByRole('option', { name: 'Coffee' })).not.toBeInTheDocument();
    expect(within(target).queryByRole('option', { name: /Old stuff/ })).not.toBeInTheDocument();
    await user.selectOptions(target, 'Eating out');
    await user.click(within(form).getByRole('button', { name: 'Archive Coffee' }));
    await waitFor(() => {
      expect(writes(calls)).toEqual([
        { method: 'DELETE', path: '/api/categories/6', body: undefined },
      ]);
    });
    const url = vi
      .mocked(fetch)
      .mock.calls.map(([input]) => input as string)
      .find((u) => u.includes('/api/categories/6'));
    expect(url).toContain('reassignTo=7');
  });

  it('archives without reassignment', async () => {
    api({ 'DELETE /api/categories/6': () => ({ body: { ...CATEGORIES[1], archived: true } }) });
    const user = userEvent.setup();
    renderAt('/categories');
    await user.click(await screen.findByRole('button', { name: 'Archive Coffee' }));
    const form = screen.getByRole('form', { name: 'Archive Coffee' });
    await user.click(within(form).getByRole('button', { name: 'Archive Coffee' }));
    await waitFor(() => {
      const url = vi
        .mocked(fetch)
        .mock.calls.map(([input]) => input as string)
        .find((u) => u.includes('/api/categories/6'));
      expect(url).toBeDefined();
      expect(url).not.toContain('reassignTo');
    });
  });

  it('restores an archived category', async () => {
    const calls = api({
      'PATCH /api/categories/9': () => ({ body: { ...CATEGORIES[3], archived: false } }),
    });
    const user = userEvent.setup();
    renderAt('/categories');
    await user.click(await screen.findByRole('button', { name: 'Restore Old stuff' }));
    await waitFor(() => {
      expect(writes(calls)).toEqual([
        { method: 'PATCH', path: '/api/categories/9', body: { archived: false } },
      ]);
    });
  });
});
