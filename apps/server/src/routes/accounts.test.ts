import { getCsvPreset } from '@funance/core';
import {
  accountListResponseSchema,
  apiErrorSchema,
  createAccountResponseSchema,
  updateAccountResponseSchema,
  type CreateAccountRequest,
} from '@funance/shared';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeTempDir } from '../db/test-db.js';
import { makeTestApp, TEST_NOW } from '../test-app.js';

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

function send(method: 'POST' | 'PATCH', path: string, body: unknown) {
  return ctx.app.request(`/api/accounts${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function list() {
  return accountListResponseSchema.parse(await (await ctx.app.request('/api/accounts')).json());
}

async function errorCode(res: Response): Promise<string> {
  return apiErrorSchema.parse(await res.json()).error.code;
}

function walmartAccount(): CreateAccountRequest {
  const mapping = structuredClone(getCsvPreset('walmart-mastercard').mapping);
  mapping.ownerHintMap = { 'ALEX SAMPLE': 1, 'JAMIE SAMPLE': 2 };
  return {
    name: 'Second Walmart card',
    institution: 'walmart',
    type: 'credit_card',
    defaultOwnerId: 3,
    csvMapping: mapping,
  };
}

describe('GET /api/accounts', () => {
  it('lists the five seeded accounts with their preset mappings', async () => {
    const accounts = await list();
    expect(accounts.map((a) => a.name).sort()).toEqual([
      'RBC',
      'Simplii Visa',
      'Tangerine Chequing',
      'Tangerine Mastercard',
      'Walmart Mastercard',
    ]);
    const walmart = accounts.find((a) => a.name === 'Walmart Mastercard');
    expect(walmart?.csvMapping).toEqual(getCsvPreset('walmart-mastercard').mapping);
  });

  it('lists archived accounts after active ones', async () => {
    const first = (await list())[0];
    if (first === undefined) throw new Error('no accounts');
    await send('PATCH', `/${first.id}`, { archived: true });
    const accounts = await list();
    expect(accounts.at(-1)).toMatchObject({ id: first.id, archived: true });
  });
});

describe('POST /api/accounts', () => {
  it('creates an account with an owner-hint map and returns 201', async () => {
    const res = await send('POST', '', walmartAccount());
    expect(res.status).toBe(201);
    const account = createAccountResponseSchema.parse(await res.json());
    expect(account).toMatchObject({
      name: 'Second Walmart card',
      archived: false,
      createdAt: TEST_NOW,
      defaultOwnerId: 3,
    });
    expect(account.csvMapping.ownerHintMap).toEqual({ 'ALEX SAMPLE': 1, 'JAMIE SAMPLE': 2 });
    expect((await list()).find((a) => a.id === account.id)).toEqual(account);
  });

  it('rejects a duplicate name with 409', async () => {
    const res = await send('POST', '', { ...walmartAccount(), name: 'Walmart Mastercard' });
    expect(res.status).toBe(409);
    expect(await errorCode(res)).toBe('conflict');
  });

  it('rejects an unknown default owner with 400', async () => {
    const res = await send('POST', '', { ...walmartAccount(), defaultOwnerId: 77 });
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe('invalid_reference');
  });

  it('rejects an owner-hint map pointing at an unknown owner with 400', async () => {
    const body = walmartAccount();
    body.csvMapping.ownerHintMap = { 'ALEX SAMPLE': 1, 'JAMIE SAMPLE': 55 };
    const res = await send('POST', '', body);
    expect(res.status).toBe(400);
    expect(apiErrorSchema.parse(await res.json()).error.details).toEqual([55]);
  });

  it('rejects invalid bodies with 400 and creates nothing', async () => {
    const good = walmartAccount();
    const bad: unknown[] = [
      {},
      { ...good, name: '' },
      { ...good, institution: 'chase' },
      { ...good, type: 'loan' },
      { ...good, csvMapping: { ...good.csvMapping, dateFormat: 'dd.MM.yyyy' } },
      // Neither a single amount column nor outflow and inflow.
      {
        ...good,
        csvMapping: {
          ...good.csvMapping,
          columns: { date: 'Date', description: ['Merchant Name'] },
        },
      },
      { ...good, csvMapping: { ...good.csvMapping, ownerHintMap: { 'ALEX SAMPLE': 'Colin' } } },
    ];
    for (const body of bad) {
      const res = await send('POST', '', body);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('validation_error');
    }
    expect(await list()).toHaveLength(5);
  });
});

describe('PATCH /api/accounts/:id', () => {
  it('edits fields and the mapping', async () => {
    const created = createAccountResponseSchema.parse(
      await (await send('POST', '', walmartAccount())).json(),
    );
    const mapping = { ...created.csvMapping, accountFilterValue: '0001' };
    const res = await send('PATCH', `/${created.id}`, {
      name: 'Walmart (Alex)',
      defaultOwnerId: 1,
      csvMapping: mapping,
    });
    expect(res.status).toBe(200);
    const updated = updateAccountResponseSchema.parse(await res.json());
    expect(updated).toMatchObject({ name: 'Walmart (Alex)', defaultOwnerId: 1 });
    expect(updated.csvMapping.accountFilterValue).toBe('0001');
    expect(updated.createdAt).toBe(created.createdAt);
  });

  it('archives and unarchives', async () => {
    const res = await send('PATCH', '/1', { archived: true });
    expect(updateAccountResponseSchema.parse(await res.json()).archived).toBe(true);
    const back = await send('PATCH', '/1', { archived: false });
    expect(updateAccountResponseSchema.parse(await back.json()).archived).toBe(false);
  });

  it('accepts an empty patch and changes nothing', async () => {
    const before = (await list()).find((a) => a.id === 1);
    const res = await send('PATCH', '/1', {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(before);
  });

  it('allows keeping its own name but not taking another account name', async () => {
    const [a, b] = await list();
    if (a === undefined || b === undefined) throw new Error('no accounts');
    expect((await send('PATCH', `/${a.id}`, { name: a.name })).status).toBe(200);
    const res = await send('PATCH', `/${a.id}`, { name: b.name });
    expect(res.status).toBe(409);
  });

  it('returns 404 for an unknown account', async () => {
    const res = await send('PATCH', '/999', { archived: true });
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('not_found');
  });

  it('rejects invalid patches with 400', async () => {
    for (const body of [{ archived: 'yes' }, { type: 'loan' }, { defaultOwnerId: -1 }]) {
      const res = await send('PATCH', '/1', body);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe('validation_error');
    }
    const unknownOwner = await send('PATCH', '/1', { defaultOwnerId: 404 });
    expect(unknownOwner.status).toBe(400);
    expect(await errorCode(unknownOwner)).toBe('invalid_reference');
    const badId = await send('PATCH', '/zero', { archived: true });
    expect(badId.status).toBe(400);
  });
});
