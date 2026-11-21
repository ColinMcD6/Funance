import { transactionQuerySchema, type TransactionQuery } from '@funance/shared';

// The Transactions page keeps its whole query (filters, sort, page) in the URL, so a reload, a
// shared link or the back button shows the same list.

const QUERY_KEYS = Object.keys(transactionQuerySchema.shape) as (keyof TransactionQuery)[];

/** The query a URL asks for. Values the API would reject are dropped, not reported. */
export function parseTransactionSearch(params: URLSearchParams): TransactionQuery {
  let raw = new Map<string, string>();
  for (const key of QUERY_KEYS) {
    const value = params.get(key);
    if (value !== null && value !== '') raw.set(key, value);
  }
  for (;;) {
    const result = transactionQuerySchema.safeParse(Object.fromEntries(raw));
    if (result.success) return result.data;
    const invalid = new Set(result.error.issues.map((issue) => issue.path[0]));
    const kept = new Map([...raw].filter(([key]) => !invalid.has(key)));
    // An issue not tied to one key cannot be fixed by dropping keys: fall back to the defaults.
    raw = kept.size < raw.size ? kept : new Map<string, string>();
  }
}

const DEFAULTS = transactionQuerySchema.parse({});

/** URL search parameters for `query`, leaving out values equal to the API's defaults. */
export function toTransactionSearch(query: TransactionQuery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of QUERY_KEYS) {
    const value = query[key];
    if (value === undefined || value === DEFAULTS[key]) continue;
    params.set(key, String(value));
  }
  return params;
}

/** `query` with `change` applied. Any change other than the page itself goes back to page 1. */
export function changeQuery(
  query: TransactionQuery,
  change: Partial<TransactionQuery>,
): TransactionQuery {
  const next = { ...query, ...change };
  if (!('page' in change)) next.page = 1;
  return next;
}

/** Filter fields, which "Clear filters" resets (sort and page size are kept). */
export const FILTER_KEYS = [
  'owner',
  'account',
  'category',
  'from',
  'to',
  'q',
  'minCents',
  'maxCents',
  'excluded',
] as const satisfies readonly (keyof TransactionQuery)[];

export function hasFilters(query: TransactionQuery): boolean {
  return FILTER_KEYS.some((key) => query[key] !== undefined);
}

export function clearFilters(query: TransactionQuery): TransactionQuery {
  const cleared: Partial<TransactionQuery> = {};
  for (const key of FILTER_KEYS) cleared[key] = undefined;
  return changeQuery(query, cleared);
}
