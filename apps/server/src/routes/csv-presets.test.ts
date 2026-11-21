import { csvPresets } from '@funance/core';
import { csvPresetListResponseSchema } from '@funance/shared';
import { afterAll, describe, expect, it } from 'vitest';
import { makeTempDir } from '../db/test-db.js';
import { makeTestApp } from '../test-app.js';

const temp = makeTempDir();
const ctx = makeTestApp(temp.dir);
afterAll(() => {
  ctx.close();
  temp.cleanup();
});

describe('GET /api/csv-presets', () => {
  it('returns the five presets from core', async () => {
    const res = await ctx.app.request('/api/csv-presets');
    expect(res.status).toBe(200);
    const presets = csvPresetListResponseSchema.parse(await res.json());
    expect(presets.map((p) => p.id)).toEqual([
      'tangerine-chequing',
      'tangerine-mastercard',
      'simplii',
      'walmart-mastercard',
      'rbc',
    ]);
    expect(presets).toEqual(csvPresets);
  });

  it('does not accept POST', async () => {
    const res = await ctx.app.request('/api/csv-presets', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
