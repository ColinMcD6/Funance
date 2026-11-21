import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { apiErrorSchema, healthResponseSchema } from '@funance/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeTempDir } from './db/test-db.js';
import { makeTestApp } from './test-app.js';

const temp = makeTempDir();
const opened: (() => void)[] = [];
afterAll(() => {
  for (const close of opened) close();
  temp.cleanup();
});

function createApp(options: { version: string; staticDir?: string }) {
  const { app, close } = makeTestApp(temp.dir, options);
  opened.push(close);
  return app;
}

describe('GET /api/health', () => {
  it('returns ok with the version', async () => {
    const app = createApp({ version: '1.2.3' });
    const res = await app.request('/api/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(await res.json())).toEqual({
      status: 'ok',
      version: '1.2.3',
    });
  });
});

describe('unknown API routes', () => {
  it('return a JSON 404 in the documented error shape', async () => {
    const app = createApp({ version: '1.2.3' });
    const res = await app.request('/api/nope', { method: 'POST' });
    expect(res.status).toBe(404);
    const body = apiErrorSchema.parse(await res.json());
    expect(body.error.code).toBe('not_found');
  });
});

describe('static web app', () => {
  let staticDir: string;

  beforeAll(() => {
    staticDir = mkdtempSync(join(tmpdir(), 'funance-static-'));
    mkdirSync(join(staticDir, 'assets'));
    writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>Index</title>');
    writeFileSync(join(staticDir, 'assets', 'app.js'), 'console.log("app");');
  });

  afterAll(() => {
    rmSync(staticDir, { recursive: true, force: true });
  });

  it('serves index.html at the root', async () => {
    const res = await createApp({ version: '1', staticDir }).request('/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('<title>Index</title>');
  });

  it('serves built assets', async () => {
    const res = await createApp({ version: '1', staticDir }).request('/assets/app.js');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('console.log');
  });

  it('falls back to index.html for client-side routes', async () => {
    const res = await createApp({ version: '1', staticDir }).request('/transactions/42');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('<title>Index</title>');
  });

  it('returns 404 for missing files rather than index.html', async () => {
    const res = await createApp({ version: '1', staticDir }).request('/assets/missing.js');
    expect(res.status).toBe(404);
  });

  it('still answers API routes as JSON', async () => {
    const res = await createApp({ version: '1', staticDir }).request('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });
});
