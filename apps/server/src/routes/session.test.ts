import { apiErrorSchema, sessionResponseSchema } from '@funance/shared';
import { Hono } from 'hono';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../db/test-db.js';
import { HttpError, errorResponse } from '../http.js';
import { activeProfile, requireProfile } from '../profile.js';
import { makeTestApp } from '../test-app.js';

const temp = makeTempDir();
afterAll(() => {
  temp.cleanup();
});

let ctx: ReturnType<typeof makeTestApp>;
beforeEach(() => {
  ctx = makeTestApp(temp.dir);
});
afterEach(() => {
  ctx.close();
});

function post(body: unknown) {
  return ctx.app.request('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/session', () => {
  it('sets the profile cookie for a person and returns the owner', async () => {
    const res = await post({ ownerId: 2 });
    expect(res.status).toBe(200);
    expect(sessionResponseSchema.parse(await res.json()).owner).toMatchObject({
      id: 2,
      name: 'Emily',
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^profile=2;/);
    expect(cookie).toContain('Path=/');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toMatch(/Max-Age=\d+/);
    // The web app reads the cookie to know the active profile.
    expect(cookie).not.toContain('HttpOnly');
  });

  it('rejects the joint owner with 400', async () => {
    const res = await post({ ownerId: 3 });
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('not_a_profile');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects an unknown owner with 404', async () => {
    const res = await post({ ownerId: 42 });
    expect(res.status).toBe(404);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('rejects a malformed body with 400', async () => {
    for (const body of [{}, { ownerId: 'one' }, { ownerId: 0 }, { ownerId: 1.5 }]) {
      const res = await post(body);
      expect(res.status).toBe(400);
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe('validation_error');
    }
  });
});

describe('DELETE /api/session', () => {
  it('clears the cookie and returns a null owner', async () => {
    const res = await ctx.app.request('/api/session', { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(sessionResponseSchema.parse(await res.json())).toEqual({ owner: null });
    expect(res.headers.get('set-cookie')).toMatch(/^profile=;.*Max-Age=0/);
  });
});

describe('activeProfile and requireProfile', () => {
  function probe() {
    const app = new Hono();
    app.get('/who', (c) => c.json({ id: activeProfile(c, ctx.db)?.id ?? null }));
    app.get('/must', (c) => c.json({ id: requireProfile(c, ctx.db).id }));
    app.onError((err, c) =>
      err instanceof HttpError
        ? errorResponse(c, err.status, err.code, err.message)
        : errorResponse(c, 500, 'internal', err.message),
    );
    return app;
  }

  async function who(cookie?: string): Promise<unknown> {
    const headers: Record<string, string> = cookie === undefined ? {} : { Cookie: cookie };
    return (await probe().request('/who', { headers })).json();
  }

  it('reads a person from the cookie', async () => {
    expect(await who('profile=1')).toEqual({ id: 1 });
  });

  it('ignores a missing, malformed, unknown or joint profile', async () => {
    expect(await who()).toEqual({ id: null });
    expect(await who('profile=abc')).toEqual({ id: null });
    expect(await who('profile=1e3')).toEqual({ id: null });
    expect(await who('profile=99')).toEqual({ id: null });
    expect(await who('profile=3')).toEqual({ id: null });
  });

  it('requireProfile answers 401 without a profile', async () => {
    const res = await probe().request('/must');
    expect(res.status).toBe(401);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('no_profile');
    const ok = await probe().request('/must', { headers: { Cookie: 'profile=2' } });
    expect(await ok.json()).toEqual({ id: 2 });
  });
});
