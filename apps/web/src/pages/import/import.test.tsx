import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
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

function account(id: number, name: string, archived = false) {
  return {
    id,
    name,
    institution: 'tangerine',
    type: 'chequing',
    defaultOwnerId: 1,
    csvMapping: MAPPING,
    archived,
    createdAt: '2026-11-20T12:00:00.000Z',
  };
}

const ACCOUNTS = [account(1, 'Tangerine Chequing'), account(2, 'Old card', true)];

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    accountId: 1,
    filename: 'september.csv',
    fileSha256: 'a'.repeat(64),
    status: 'preview',
    uploadedByOwnerId: 1,
    rowCount: 4,
    insertedCount: 2,
    duplicateCount: 0,
    skippedCount: 1,
    errorCount: 1,
    dateMin: '2026-09-01',
    dateMax: '2026-09-03',
    createdAt: '2026-11-20T12:00:00.000Z',
    committedAt: null,
    undoneAt: null,
    kind: 'csv',
    ...overrides,
  };
}

function row(line: number, status: string, fields: Record<string, unknown> = {}) {
  const parsed = status === 'new' || status === 'duplicate';
  return {
    line,
    status,
    reason: null,
    date: parsed ? '2026-09-01' : null,
    postedDate: null,
    amountCents: parsed ? -1234 : null,
    description: parsed ? `Purchase ${line}` : null,
    memo: null,
    merchantKey: parsed ? `PURCHASE` : null,
    bankCategory: null,
    externalId: null,
    dedupKey: parsed ? `key-${line}` : null,
    occurrence: parsed ? 1 : null,
    ownerId: parsed ? 1 : null,
    categoryId: null,
    ruleId: null,
    raw: {},
    ...fields,
  };
}

const PREVIEW = {
  import: summary(),
  rows: [
    row(2, 'new'),
    row(3, 'new', { amountCents: 185000, description: 'Payroll' }),
    row(4, 'skipped', { reason: 'Zero amount' }),
    row(5, 'error', { reason: 'Date "13/45/2026" is not a MM/dd/yyyy date' }),
  ],
  sameFileImportIds: [3],
  legacyOverlapMonths: [],
};

function api(overrides = {}) {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/accounts': () => ({ body: ACCOUNTS }),
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

async function chooseFile(user: ReturnType<typeof userEvent.setup>) {
  const select = await screen.findByLabelText('Account');
  await screen.findByRole('option', { name: 'Tangerine Chequing' });
  await user.selectOptions(select, 'Tangerine Chequing');
  await user.upload(
    screen.getByLabelText('Statement file'),
    new File(['Date,Transaction,Name,Memo,Amount\n'], 'september.csv', { type: 'text/csv' }),
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

describe('Import page', () => {
  it('offers only active accounts', async () => {
    api();
    renderAt('/import');
    await screen.findByRole('option', { name: 'Tangerine Chequing' });
    expect(screen.queryByRole('option', { name: 'Old card' })).not.toBeInTheDocument();
  });

  it('previews a file, filters rows by status, commits, and shows the result', async () => {
    const committed = summary({ status: 'committed', committedAt: '2026-11-20T12:00:00.000Z' });
    const calls = api({
      'POST /api/imports/preview': () => ({ status: 201, body: PREVIEW }),
      'POST /api/imports/7/commit': () => ({ body: committed }),
      'GET /api/imports/7': () => ({
        body: { import: committed, manuallyCategorizedCount: 0 },
      }),
    });
    const user = userEvent.setup();
    renderAt('/import');
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));

    expect(await screen.findByRole('heading', { name: 'Preview: september.csv' })).toBeVisible();
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'POST', path: '/api/imports/preview' }),
    );
    expect(screen.getByTestId('count-new')).toHaveTextContent('2');
    expect(screen.getByTestId('count-error')).toHaveTextContent('1');
    expect(screen.getByRole('status')).toHaveTextContent('This exact file was imported before');
    expect(screen.getAllByTestId('preview-row')).toHaveLength(4);
    expect(screen.getAllByText('$1,850.00').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Error (1)' }));
    const rows = screen.getAllByTestId('preview-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent('is not a MM/dd/yyyy date');
    expect(screen.getByRole('button', { name: 'Error (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Commit 2 new transactions' }));
    expect(calls).toContainEqual({ method: 'POST', path: '/api/imports/7/commit', body: {} });
    expect(
      await screen.findByRole('heading', { name: 'Imported 2 transactions' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Categorize new transactions' })).toHaveAttribute(
      'href',
      '/uncategorized',
    );
  });

  it('cancels a preview back to the file form', async () => {
    api({ 'POST /api/imports/preview': () => ({ status: 201, body: PREVIEW }) });
    const user = userEvent.setup();
    renderAt('/import');
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Preview' })).toBeDisabled();
  });

  it('shows a missing-columns error with a link to the account mapping', async () => {
    api({
      'POST /api/imports/preview': () => ({
        status: 400,
        body: {
          error: {
            code: 'missing_columns',
            message: 'The file has no column named "Date"',
            details: { missingColumns: ['Date'] },
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderAt('/import');
    await chooseFile(user);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The file has no column named "Date"');
    expect(
      within(alert).getByRole('link', { name: 'Edit the Tangerine Chequing mapping' }),
    ).toHaveAttribute('href', '/settings/accounts/1');
  });
});

describe('Import history', () => {
  const COMMITTED = summary({
    id: 7,
    status: 'committed',
    committedAt: '2026-11-19T10:00:00.000Z',
    insertedCount: 38,
  });
  const UNDONE = summary({ id: 5, status: 'undone', undoneAt: '2026-11-18T10:00:00.000Z' });
  const PREVIEWED = summary({ id: 8, filename: 'unfinished.csv' });

  it('lists committed and undone imports, not previews', async () => {
    api({ 'GET /api/imports': () => ({ body: [PREVIEWED, COMMITTED, UNDONE] }) });
    renderAt('/import/history');
    await screen.findByText('#7 · Tangerine Chequing · 2026-11-19');
    expect(screen.getAllByTestId('import-row')).toHaveLength(2);
    expect(screen.queryByText('unfinished.csv')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo import 7' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Undo import 5' })).not.toBeInTheDocument();
  });

  it('confirms an undo, stating the manual categories that will be lost', async () => {
    const calls = api({
      'GET /api/imports': () => ({ body: [COMMITTED] }),
      'GET /api/imports/7': () => ({ body: { import: COMMITTED, manuallyCategorizedCount: 3 } }),
      'POST /api/imports/7/undo': () => ({ body: { ...COMMITTED, status: 'undone' } }),
    });
    const user = userEvent.setup();
    renderAt('/import/history');
    await user.click(await screen.findByRole('button', { name: 'Undo import 7' }));
    const dialog = screen.getByRole('alertdialog', { name: 'Confirm undo of import 7' });
    expect(dialog).toHaveTextContent('This deletes the 38 transactions it added.');
    expect(
      await within(dialog).findByText(
        /3 of them were categorized by hand, and those categories will be lost/,
      ),
    ).toBeVisible();
    expect(calls.some((c) => c.path === '/api/imports/7/undo')).toBe(false);

    await user.click(within(dialog).getByRole('button', { name: 'Undo import' }));
    expect(calls).toContainEqual({ method: 'POST', path: '/api/imports/7/undo', body: undefined });
  });

  it('keeps the import when the confirmation is dismissed', async () => {
    const calls = api({
      'GET /api/imports': () => ({ body: [COMMITTED] }),
      'GET /api/imports/7': () => ({ body: { import: COMMITTED, manuallyCategorizedCount: 0 } }),
    });
    const user = userEvent.setup();
    renderAt('/import/history');
    await user.click(await screen.findByRole('button', { name: 'Undo import 7' }));
    expect(await screen.findByText(/None of them were categorized by hand/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(calls.some((c) => c.path === '/api/imports/7/undo')).toBe(false);
  });
});
