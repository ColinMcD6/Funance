import { describe, expect, it } from 'vitest';
import { apiErrorSchema, healthResponseSchema } from './api.js';

describe('healthResponseSchema', () => {
  it('accepts an ok status with a version', () => {
    expect(healthResponseSchema.parse({ status: 'ok', version: '0.1.0' })).toEqual({
      status: 'ok',
      version: '0.1.0',
    });
  });

  it('rejects any other status or an empty version', () => {
    expect(healthResponseSchema.safeParse({ status: 'down', version: '0.1.0' }).success).toBe(
      false,
    );
    expect(healthResponseSchema.safeParse({ status: 'ok', version: '' }).success).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('accepts the documented error shape', () => {
    const body = { error: { code: 'not_found', message: 'No such route' } };
    expect(apiErrorSchema.parse(body)).toEqual(body);
  });
});
