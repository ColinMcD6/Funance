import type { ApiError } from '@funance/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

/**
 * An expected failure with a status and error code, rendered as the documented error body
 * by the app's error handler. Services throw it for missing rows (404) and conflicts (409).
 */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export function notFound(what: string, id: number): HttpError {
  return new HttpError(404, 'not_found', `${what} ${id} does not exist`);
}

/** Writes the documented `{ error: { code, message, details? } }` body. */
export function errorResponse(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: unknown,
) {
  const body: ApiError = { error: { code, message } };
  if (details !== undefined) body.error.details = details;
  return c.json(body, status);
}

function parseWith<T extends z.ZodType>(schema: T, value: unknown, what: string): z.output<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'validation_error', `Invalid ${what}`, result.error.issues);
  }
  return result.data;
}

/** Reads and validates the JSON body; 400 when it is not JSON or does not match `schema`. */
export async function parseJsonBody<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.output<T>> {
  let json: unknown;
  try {
    json = await c.req.json();
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be JSON');
  }
  return parseWith(schema, json, 'request body');
}

/** Validates the path parameters; 400 when they do not match `schema`. */
export function parseParams<T extends z.ZodType>(c: Context, schema: T): z.output<T> {
  return parseWith(schema, c.req.param(), 'path parameter');
}

/** Validates the query string; 400 when it does not match `schema`. */
export function parseQuery<T extends z.ZodType>(c: Context, schema: T): z.output<T> {
  return parseWith(schema, c.req.query(), 'query string');
}
