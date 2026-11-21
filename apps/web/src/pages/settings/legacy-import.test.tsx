import { QueryClient } from '@tanstack/react-query';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, type RouteObject } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/app';
import { mockApi, OWNERS } from '@/test-utils/mock-api';

function summary(overrides: Record<string, unknown> = {}) {
  return {
    id: 9,
    accountId: null,
    filename: 'Expense-Monthly-Data.xlsx',
    fileSha256: 'b'.repeat(64),
    status: 'preview',
    uploadedByOwnerId: 1,
    rowCount: 2,
    insertedCount: 2,
    duplicateCount: 0,
    skippedCount: 0,
    errorCount: 0,
    dateMin: '2026-07-01',
    dateMax: '2026-08-02',
    createdAt: '2026-11-20T12:00:00.000Z',
    committedAt: null,
    undoneAt: null,
    kind: 'legacy',
    ...overrides,
  };
}

function row(sheet: string, line: number, category: string, categoryId: number) {
  return {
    line,
    status: 'new',
    reason: null,
    date: `20${sheet.slice(5)}-${sheet.slice(0, 2)}-0${line - 1}`,
    postedDate: null,
    amountCents: -4550,
    description: `Superstore ${sheet}`,
    memo: null,
    merchantKey: 'SUPERSTORE',
    bankCategory: null,
    externalId: null,
    dedupKey: `key-${sheet}-${line}`,
    occurrence: 1,
    ownerId: 3,
    categoryId,
    ruleId: null,
    raw: { sheet, Category: category },
  };
}

const CLEAN = {
  import: summary(),
  // The same sheet row in two sheets: rows are told apart by sheet.
  rows: [row('07-2026', 2, 'Groceries', 4), row('08-2026', 2, 'Coffee', 6)],
  sameFileImportIds: [],
  legacyOverlapMonths: [],
  monthTotals: [
    { month: '2026-07', count: 1, sheetTotalCents: 4550 },
    { month: '2026-08', count: 1, sheetTotalCents: -210000 },
  ],
  violations: [],
};

const WITH_PROBLEMS = {
  ...CLEAN,
  import: summary({ errorCount: 1 }),
  violations: [
    {
      sheet: '07-2026',
      row: 1,
      column: 'D',
      rule: 'header',
      message: 'Header D1 must be "Category", not "Catergory"',
    },
    { sheet: '', row: null, column: null, rule: 'no-month-sheets', message: 'No month sheet' },
  ],
};

function api(overrides = {}) {
  return mockApi({
    'GET /api/health': () => ({ body: { status: 'ok', version: '0.1.0' } }),
    'GET /api/owners': () => ({ body: OWNERS }),
    'GET /api/accounts': () => ({ body: [] }),
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

async function uploadWorkbook(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    await screen.findByLabelText('Workbook'),
    new File(['xlsx'], 'Expense-Monthly-Data.xlsx'),
  );
  await user.click(screen.getByRole('button', { name: 'Preview' }));
}

beforeEach(() => {
  document.cookie = 'profile=1; path=/';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.cookie = 'profile=; path=/; max-age=0';
});

describe('Legacy spreadsheet import', () => {
  it('is reached from Settings', async () => {
    api();
    renderAt('/settings');
    expect(await screen.findByRole('link', { name: 'Import legacy spreadsheet' })).toHaveAttribute(
      'href',
      '/settings/legacy-import',
    );
  });

  it('shows month totals and rows, commits, and opens the result', async () => {
    const committed = summary({ status: 'committed', committedAt: '2026-11-20T12:00:00.000Z' });
    const calls = api({
      'POST /api/imports/legacy/preview': () => ({ status: 201, body: CLEAN }),
      'POST /api/imports/9/commit': () => ({ body: committed }),
      'GET /api/imports/9': () => ({ body: { import: committed, manuallyCategorizedCount: 2 } }),
    });
    const user = userEvent.setup();
    renderAt('/settings/legacy-import');
    await uploadWorkbook(user);

    expect(
      await screen.findByRole('heading', { name: 'Preview: Expense-Monthly-Data.xlsx' }),
    ).toBeVisible();
    const totals = screen.getAllByTestId('month-total');
    expect(totals.map((t) => t.textContent)).toEqual(['2026-071$45.50', '2026-081-$2,100.00']);
    const rows = screen.getAllByTestId('preview-row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('07-2026 row 2');
    expect(rows[0]).toHaveTextContent('Groceries');
    expect(rows[0]).toHaveTextContent('Joint');
    expect(rows[1]).toHaveTextContent('Coffee');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Commit 2 transactions' }));
    expect(calls).toContainEqual({ method: 'POST', path: '/api/imports/9/commit', body: {} });
    expect(
      await screen.findByRole('heading', { name: 'Imported 2 transactions' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Expense-Monthly-Data\.xlsx · None/)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Categorize new transactions' }),
    ).not.toBeInTheDocument();
  });

  it('lists every violation and keeps Commit disabled', async () => {
    api({ 'POST /api/imports/legacy/preview': () => ({ status: 201, body: WITH_PROBLEMS }) });
    const user = userEvent.setup();
    renderAt('/settings/legacy-import');
    await uploadWorkbook(user);

    const list = await screen.findByRole('heading', { name: '2 problems to fix in the workbook' });
    expect(list).toBeVisible();
    const items = screen.getAllByTestId('violation');
    expect(items[0]).toHaveTextContent('Sheet 07-2026, row 1, column D');
    expect(items[0]).toHaveTextContent('Header D1 must be "Category", not "Catergory" (header)');
    expect(within(items[1] as HTMLElement).getByText('Workbook')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commit 2 transactions' })).toBeDisabled();
  });

  it('shows the 409 when the spreadsheet is already imported', async () => {
    api({
      'POST /api/imports/legacy/preview': () => ({
        status: 409,
        body: {
          error: {
            code: 'legacy_already_committed',
            message: 'The legacy spreadsheet is already imported (import #3).',
          },
        },
      }),
    });
    const user = userEvent.setup();
    renderAt('/settings/legacy-import');
    await uploadWorkbook(user);
    expect(await screen.findByRole('alert')).toHaveTextContent('already imported (import #3)');
  });
});
