import { apiErrorSchema, healthResponseSchema, type HealthResponse } from '@funance/shared';
import type { z } from 'zod';

/** Thrown when an `/api` call fails or returns a body that does not match its schema. */
export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

async function getJson<T extends z.ZodType>(path: string, schema: T): Promise<z.infer<T>> {
  const res = await fetch(`/api${path}`, { headers: { Accept: 'application/json' } });
  const body: unknown = await res.json().catch(() => undefined);
  if (!res.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    const message = parsed.success ? parsed.data.error.message : `HTTP ${res.status}`;
    throw new ApiRequestError(message, res.status);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiRequestError(`Unexpected response from ${path}`, res.status);
  }
  return parsed.data;
}

export function getHealth(): Promise<HealthResponse> {
  return getJson('/health', healthResponseSchema);
}
