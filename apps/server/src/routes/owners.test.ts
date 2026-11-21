import {
  apiErrorSchema,
  ownerListResponseSchema,
  updateOwnerResponseSchema,
} from '@funance/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../db/test-db.js';
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

function patch(id: number | string, body: unknown) {
  return ctx.app.request(`/api/owners/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function errorCode(res: Response): Promise<string> {
  return apiErrorSchema.parse(await res.json()).error.code;
}

describe('GET /api/owners', () => {
  it('lists the seeded owners in sort order', async () => {
    const res = await ctx.app.request('/api/owners');
    expect(res.status).toBe(200);
    const owners = ownerListResponseSchema.parse(await res.json());
    expect(owners.map((o) => [o.name, o.kind])).toEqual([
      ['Colin', 'person'],
      ['Emily', 'person'],
      ['Joint', 'joint'],
    ]);
  });
});

describe('PATCH /api/owners/:id', () => {
  it('renames an owner, trimming the name, and the list shows it', async () => {
    const res = await patch(2, { name: '  Em  ' });
    expect(res.status).toBe(200);
    expect(updateOwnerResponseSchema.parse(await res.json())).toMatchObject({ id: 2, name: 'Em' });
    const list = ownerListResponseSchema.parse(await (await ctx.app.request('/api/owners')).json());
    expect(list.map((o) => o.name)).toEqual(['Colin', 'Em', 'Joint']);
  });

  it('allows renaming an owner to its own name', async () => {
    expect((await patch(1, { name: 'Colin' })).status).toBe(200);
  });

  it('rejects an empty name with 400', async () => {
    const res = await patch(1, { name: '   ' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });

  it('rejects a missing name with 400', async () => {
    const res = await patch(1, {});
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });

  it('rejects a body that is not JSON with 400', async () => {
    const res = await patch(1, '{not json');
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_json');
  });

  it('rejects a non-numeric id with 400', async () => {
    const res = await patch('abc', { name: 'X' });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('validation_error');
  });

  it('returns 404 for an unknown owner', async () => {
    const res = await patch(99, { name: 'Nobody' });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('not_found');
  });

  it("returns 409 for another owner's name", async () => {
    const res = await patch(1, { name: 'Emily' });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('conflict');
  });
});
