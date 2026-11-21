import type { Account, Owner, Transaction } from '@funance/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiRequestError,
  archiveCategory,
  bulkUpdateTransactions,
  commitImport,
  getMonthlyReport,
  listOwners,
  listTransactions,
  previewImport,
  renameOwner,
  setSession,
} from './client';
import { toQueryString } from './http';

type Call = { url: string; init: RequestInit };

function mockFetch(status: number, body: unknown): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const colin: Owner = { id: 1, name: 'Colin', kind: 'person', sortOrder: 1 };

const transaction: Transaction = {
  id: 7,
  accountId: 1,
  importId: 2,
  ownerId: 1,
  categoryId: null,
  categorySource: null,
  ruleId: null,
  date: '2026-10-05',
  postedDate: null,
  amountCents: -6120,
  description: 'SHELL C12345 WINNIPEG MB',
  memo: null,
  merchantKey: 'SHELL WINNIPEG MB',
  bankCategory: null,
  externalId: null,
  dedupKey: 'abc',
  occurrence: 1,
  notes: null,
  excluded: false,
  rawRow: { Date: '10/05/2026' },
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('toQueryString', () => {
  it('skips undefined values and encodes the rest', () => {
    expect(toQueryString({ a: 1, b: undefined, q: 'wal mart', excluded: false })).toBe(
      '?a=1&q=wal+mart&excluded=false',
    );
    expect(toQueryString({})).toBe('');
    expect(toQueryString()).toBe('');
  });
});

describe('api client', () => {
  it('GETs a list and validates it', async () => {
    const calls = mockFetch(200, [colin]);
    await expect(listOwners()).resolves.toEqual([colin]);
    expect(calls[0]?.url).toBe('/api/owners');
    expect(calls[0]?.init.method).toBe('GET');
  });

  it('sends JSON bodies with the right method', async () => {
    const calls = mockFetch(200, { ...colin, name: 'Alex' });
    await renameOwner(1, 'Alex');
    expect(calls[0]?.url).toBe('/api/owners/1');
    expect(calls[0]?.init.method).toBe('PATCH');
    expect(calls[0]?.init.body).toBe('{"name":"Alex"}');
    expect(calls[0]?.init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });

  it('serializes typed query parameters', async () => {
    const calls = mockFetch(200, { items: [{ ...transaction, suggestedCategoryId: 4 }], total: 1 });
    const res = await listTransactions({ category: 'none', owner: 2, page: 3, excluded: false });
    expect(res.items[0]?.suggestedCategoryId).toBe(4);
    expect(calls[0]?.url).toBe('/api/transactions?category=none&owner=2&page=3&excluded=false');
  });

  it('sends reports queries', async () => {
    const calls = mockFetch(200, { rows: [] });
    await getMonthlyReport({ from: '2026-01', to: '2026-10', owner: 'all', groupBy: 'group' });
    expect(calls[0]?.url).toBe(
      '/api/reports/monthly?from=2026-01&to=2026-10&owner=all&groupBy=group',
    );
  });

  it('omits an absent optional query parameter', async () => {
    const category = {
      id: 3,
      name: 'Coffee',
      kind: 'expense',
      color: '#92400e',
      sortOrder: 6,
      archived: true,
      groupName: 'Joy',
    };
    const calls = mockFetch(200, category);
    await archiveCategory(3);
    await archiveCategory(3, 9);
    expect(calls.map((c) => [c.init.method, c.url])).toEqual([
      ['DELETE', '/api/categories/3'],
      ['DELETE', '/api/categories/3?reassignTo=9'],
    ]);
  });

  it('uploads files as multipart form data', async () => {
    const account: Account['id'] = 4;
    const calls = mockFetch(500, { error: { code: 'internal', message: 'boom' } });
    await expect(previewImport(account, new Blob(['a,b\n']), 'walmart.csv')).rejects.toThrow(
      'boom',
    );
    const form = calls[0]?.init.body;
    expect(form).toBeInstanceOf(FormData);
    expect((form as FormData).get('accountId')).toBe('4');
    expect((form as FormData).get('file')).toBeInstanceOf(Blob);
    expect(calls[0]?.init.headers).not.toHaveProperty('Content-Type');
  });

  it('defaults the commit body', async () => {
    const calls = mockFetch(409, { error: { code: 'conflict', message: 'Already committed' } });
    await expect(commitImport(5)).rejects.toMatchObject({ status: 409, code: 'conflict' });
    expect(calls[0]?.init.body).toBe('{}');
  });

  it('turns an error body into an ApiRequestError with code and details', async () => {
    mockFetch(400, {
      error: { code: 'validation', message: 'Bad input', details: { field: 'ids' } },
    });
    const err: unknown = await bulkUpdateTransactions([1], { excluded: true }).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiRequestError);
    expect(err).toMatchObject({
      status: 400,
      code: 'validation',
      message: 'Bad input',
      details: { field: 'ids' },
    });
  });

  it('reports a non-JSON failure by status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('gateway down', { status: 502 }))),
    );
    await expect(listOwners()).rejects.toMatchObject({ status: 502, message: 'HTTP 502' });
  });

  it('rejects a response that does not match its schema in development', async () => {
    mockFetch(200, { owner: { ...colin, kind: 'robot' } });
    await expect(setSession(1)).rejects.toThrow('Unexpected response from /session');
  });
});
