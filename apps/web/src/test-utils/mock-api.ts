import { vi } from 'vitest';

export type MockCall = { method: string; path: string; body: unknown };
type Handler = (call: MockCall) => { status?: number; body: unknown };

/**
 * Stubs `fetch` with a table of `"METHOD /api/path"` handlers and records every call.
 * An unhandled call answers 404 in the API error shape.
 */
export function mockApi(handlers: Record<string, Handler>): MockCall[] {
  const calls: MockCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string, init?: RequestInit) => {
      const url = new URL(input, 'http://localhost');
      const method = init?.method ?? 'GET';
      const body: unknown = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
      const call = { method, path: url.pathname, body };
      calls.push(call);
      const handler = handlers[`${method} ${url.pathname}`];
      const result = handler?.(call) ?? {
        status: 404,
        body: { error: { code: 'not_found', message: `No mock for ${method} ${url.pathname}` } },
      };
      return Promise.resolve(
        new Response(JSON.stringify(result.body), { status: result.status ?? 200 }),
      );
    }),
  );
  return calls;
}

export const OWNERS = [
  { id: 1, name: 'Colin', kind: 'person', sortOrder: 1 },
  { id: 2, name: 'Emily', kind: 'person', sortOrder: 2 },
  { id: 3, name: 'Joint', kind: 'joint', sortOrder: 3 },
] as const;
