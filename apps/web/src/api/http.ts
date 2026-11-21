import { apiErrorSchema } from '@funance/shared';
import type { z } from 'zod';

/** Thrown when an `/api` call fails or returns a body that does not match its schema. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** The `error.code` from the server, when it sent one. */
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export type QueryValue = string | number | boolean | undefined;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Record<string, QueryValue>;
  /** Sent as JSON. */
  body?: unknown;
  /** Sent as multipart form data (file uploads). */
  form?: FormData;
};

/** `{ a: 1, b: undefined }` -> `?a=1`; empty when nothing is set. */
export function toQueryString(query: Record<string, QueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const text = params.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * Calls `/api{path}` and returns the JSON body. In development (and tests) the body is
 * validated against `schema`, so contract drift fails loudly; production builds skip the check.
 */
export async function request<T extends z.ZodType>(
  path: string,
  schema: T,
  options: RequestOptions = {},
): Promise<z.output<T>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (options.form !== undefined) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const res = await fetch(`/api${path}${toQueryString(options.query)}`, {
    method: options.method ?? 'GET',
    headers,
    body,
  });
  const json: unknown = await res.json().catch(() => undefined);

  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiRequestError(message, res.status, code, details);
    }
    throw new ApiRequestError(`HTTP ${res.status}`, res.status);
  }

  if (!import.meta.env.DEV) {
    // Production trusts the server, which validates every response with the same schema.
    return json as z.output<T>;
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiRequestError(
      `Unexpected response from ${path}`,
      res.status,
      undefined,
      parsed.error,
    );
  }
  return parsed.data;
}
