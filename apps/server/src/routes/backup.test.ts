import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiErrorSchema, backupResponseSchema, importPreviewResponseSchema } from '@funance/shared';
import Database from 'better-sqlite3';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Clock } from '../clock.js';
import { makeTempDir } from '../db/test-db.js';
import { insertTestRows } from '../db/test-rows.js';
import { BACKUP_RETENTION, backupFilename, listBackups } from '../services/backup.js';
import { makeTestApp, TEST_NOW } from '../test-app.js';

const temp = makeTempDir();
afterAll(() => {
  temp.cleanup();
});

let run = 0;
let backupDir: string;
let ctx: ReturnType<typeof makeTestApp>;

/** A clock one second later on every call, starting at TEST_NOW. */
function tickingClock(): Clock {
  let tick = 0;
  return () => new Date(Date.parse(TEST_NOW) + 1000 * tick++).toISOString();
}

/** A fresh app with backups into a folder of its own. */
function withBackups(backupClock: Clock = tickingClock()) {
  run += 1;
  backupDir = join(temp.dir, `backups-${String(run)}`);
  return makeTestApp(temp.dir, { backupDir, backupClock });
}

beforeEach(() => {
  ctx = withBackups();
});
afterEach(() => {
  ctx.close();
});

/** Rows per user table, read straight from SQLite. */
function rowCounts(connection: Database.Database): Record<string, number> {
  const tables = connection
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name",
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      (connection.prepare(`select count(*) as n from "${name}"`).get() as { n: number }).n,
    ]),
  );
}

async function takeBackup() {
  const res = await ctx.app.request('/api/backup', { method: 'POST' });
  expect(res.status).toBe(201);
  return backupResponseSchema.parse(await res.json());
}

describe('backupFilename', () => {
  it('names the file after the UTC time to the second', () => {
    expect(backupFilename('2026-11-20T09:05:07.999Z')).toBe('finance-20261120-090507.sqlite');
  });

  it('rejects text that is not a timestamp', () => {
    expect(() => backupFilename('yesterday')).toThrow(/ISO/);
  });
});

describe('POST /backup', () => {
  it('writes a valid SQLite database with the same row counts', async () => {
    insertTestRows(ctx.db, [
      { description: 'BACKUP A' },
      { description: 'BACKUP B', accountId: 2 },
      { description: 'LEGACY C', accountId: null },
    ]);
    const live = rowCounts(ctx.db.$client);
    expect(live.transactions).toBe(3);

    const backup = await takeBackup();
    expect(backup).toEqual({
      filename: 'finance-20261120-120000.sqlite',
      createdAt: TEST_NOW,
      sizeBytes: expect.any(Number) as number,
    });
    const path = join(backupDir, backup.filename);
    expect(backup.sizeBytes).toBe(readFileSync(path).length);

    const copy = new Database(path, { readonly: true, fileMustExist: true });
    try {
      expect(copy.pragma('integrity_check', { simple: true })).toBe('ok');
      expect(rowCounts(copy)).toEqual(live);
    } finally {
      copy.close();
    }
    // No partial file is left behind.
    expect(readdirSync(backupDir)).toEqual([backup.filename]);
  });

  it(`keeps the newest ${String(BACKUP_RETENTION)} and deletes the oldest beyond that`, async () => {
    // Files that are not backups are never touched.
    await takeBackup();
    writeFileSync(join(backupDir, 'notes.txt'), 'keep me');

    const taken: string[] = [];
    for (let i = 0; i < BACKUP_RETENTION + 2; i += 1) taken.push((await takeBackup()).filename);

    const kept = listBackups(backupDir);
    expect(kept).toHaveLength(BACKUP_RETENTION);
    expect(kept).toEqual(taken.slice(-BACKUP_RETENTION));
    expect(kept).not.toContain('finance-20261120-120000.sqlite');
    expect(kept[0]).toBe('finance-20261120-120003.sqlite');
    expect(existsSync(join(backupDir, 'notes.txt'))).toBe(true);
  });

  it('replaces a backup taken in the same second', async () => {
    ctx.close();
    ctx = withBackups(() => TEST_NOW);
    await takeBackup();
    insertTestRows(ctx.db, [{ description: 'LATER' }]);
    await takeBackup();
    expect(listBackups(backupDir)).toEqual(['finance-20261120-120000.sqlite']);
    const copy = new Database(join(backupDir, listBackups(backupDir)[0] ?? ''), {
      readonly: true,
    });
    try {
      expect(rowCounts(copy).transactions).toBe(1);
    } finally {
      copy.close();
    }
  });

  it('answers 409 when the server has no backup folder', async () => {
    const plain = makeTestApp(temp.dir);
    try {
      const res = await plain.app.request('/api/backup', { method: 'POST' });
      expect(res.status).toBe(409);
      expect(apiErrorSchema.parse(await res.json()).error.code).toBe('backups_disabled');
    } finally {
      plain.close();
    }
  });
});

describe('GET /backup/latest', () => {
  it('is 404 before any backup', async () => {
    const res = await ctx.app.request('/api/backup/latest');
    expect(res.status).toBe(404);
    expect(apiErrorSchema.parse(await res.json()).error.code).toBe('not_found');
  });

  it('downloads the newest backup file', async () => {
    await takeBackup();
    insertTestRows(ctx.db, [{ description: 'NEWER' }]);
    const newest = await takeBackup();

    const res = await ctx.app.request('/api/backup/latest');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="${newest.filename}"`,
    );
    const body = new Uint8Array(await res.arrayBuffer());
    expect(Buffer.from(body).equals(readFileSync(join(backupDir, newest.filename)))).toBe(true);
  });
});

describe('import commit', () => {
  it('takes a backup that already holds the committed rows', async () => {
    const form = new FormData();
    form.set(
      'file',
      new File(
        ['Date,Transaction,Name,Memo,Amount\n10/05/2026,OTHER,X,SHOP ONE,-12.00\n'],
        'a.csv',
      ),
    );
    form.set('accountId', '1');
    const previewRes = await ctx.app.request('/api/imports/preview', {
      method: 'POST',
      body: form,
      headers: { Cookie: 'profile=1' },
    });
    expect(previewRes.status).toBe(201);
    const { import: created } = importPreviewResponseSchema.parse(await previewRes.json());
    expect(listBackups(backupDir)).toEqual([]);

    const res = await ctx.app.request(`/api/imports/${String(created.id)}/commit`, {
      method: 'POST',
    });
    expect(res.status).toBe(200);
    const files = listBackups(backupDir);
    expect(files).toHaveLength(1);
    const copy = new Database(join(backupDir, files[0] ?? ''), { readonly: true });
    try {
      expect(rowCounts(copy).transactions).toBe(1);
    } finally {
      copy.close();
    }
  });
});
