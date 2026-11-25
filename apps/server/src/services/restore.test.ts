import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { fixedClock } from '../clock.js';
import { initDatabase } from '../db/init.js';
import { makeTempDir } from '../db/test-db.js';
import { insertTestRows } from '../db/test-rows.js';
import { HttpError } from '../http.js';
import { listBackups, restoreDatabase, writeBackup } from './backup.js';

const temp = makeTempDir('funance-restore-');
afterAll(() => {
  temp.cleanup();
});

let run = 0;

/** A database with one transaction, a backup of it, and then a second transaction. */
function scenario() {
  run += 1;
  const dir = join(temp.dir, `run-${String(run)}`);
  const databasePath = join(dir, 'data', 'finance.sqlite');
  const backupDir = join(dir, 'backups');
  const db = initDatabase(databasePath, fixedClock('2026-11-20T12:00:00.000Z'));
  insertTestRows(db, [{ description: 'BEFORE BACKUP' }]);
  const backup = writeBackup(db.$client, backupDir, '2026-11-20T12:00:00.000Z');
  insertTestRows(db, [{ description: 'AFTER BACKUP' }]);
  db.$client.close();
  return { dir, databasePath, backupDir, backupPath: join(backupDir, backup.filename) };
}

function descriptions(databasePath: string): string[] {
  const db = initDatabase(databasePath, fixedClock('2026-11-21T00:00:00.000Z'));
  try {
    const rows = db.$client.prepare('select description from transactions order by id').all() as {
      description: string;
    }[];
    return rows.map((r) => r.description);
  } finally {
    db.$client.close();
  }
}

describe('restoreDatabase', () => {
  it('brings back the backup: a transaction added after it is gone', () => {
    const s = scenario();
    expect(descriptions(s.databasePath)).toEqual(['BEFORE BACKUP', 'AFTER BACKUP']);

    const { safetyBackup } = restoreDatabase({
      source: s.backupPath,
      databasePath: s.databasePath,
      backupDir: s.backupDir,
      clock: fixedClock('2026-11-20T13:00:00.000Z'),
    });

    expect(descriptions(s.databasePath)).toEqual(['BEFORE BACKUP']);
    // The replaced database was saved first, so the restore can be undone.
    expect(safetyBackup?.filename).toBe('finance-20261120-130000.sqlite');
    expect(descriptions(join(s.backupDir, safetyBackup?.filename ?? ''))).toEqual([
      'BEFORE BACKUP',
      'AFTER BACKUP',
    ]);
  });

  it('restores even when the safety backup prunes the source file', () => {
    const s = scenario();
    restoreDatabase({
      source: s.backupPath,
      databasePath: s.databasePath,
      backupDir: s.backupDir,
      clock: fixedClock('2026-11-20T13:00:00.000Z'),
      keep: 1,
    });
    expect(listBackups(s.backupDir)).toEqual(['finance-20261120-130000.sqlite']);
    expect(descriptions(s.databasePath)).toEqual(['BEFORE BACKUP']);
  });

  it('restores into an empty data folder', () => {
    const s = scenario();
    const fresh = join(s.dir, 'other', 'finance.sqlite');
    const { safetyBackup } = restoreDatabase({
      source: s.backupPath,
      databasePath: fresh,
      backupDir: s.backupDir,
      clock: fixedClock('2026-11-20T13:00:00.000Z'),
    });
    expect(safetyBackup).toBeUndefined();
    expect(descriptions(fresh)).toEqual(['BEFORE BACKUP']);
  });

  it.each([
    ['a missing file', (dir: string) => join(dir, 'missing.sqlite'), /does not exist/],
    [
      'a file that is not SQLite',
      (dir: string) => {
        const path = join(dir, 'notes.sqlite');
        writeFileSync(path, 'not a database'.repeat(100));
        return path;
      },
      /not a SQLite database/,
    ],
    [
      'a SQLite file from another app',
      (dir: string) => {
        const path = join(dir, 'other.sqlite');
        const db = initDatabase(join(dir, 'scratch.sqlite'), fixedClock('2026-11-20T12:00:00Z'));
        db.$client.prepare('VACUUM INTO ?').run(path);
        db.$client.close();
        // Drop the app's tables from the copy.
        const copy = initDatabase(path, fixedClock('2026-11-20T12:00:00Z'));
        copy.$client.pragma('foreign_keys = OFF');
        copy.$client.exec('drop table transactions');
        copy.$client.close();
        return path;
      },
      /not a Finance Tracker database/,
    ],
  ])('refuses %s and leaves the database alone', (_name, makeSource, message) => {
    const s = scenario();
    const before = readFileSync(s.databasePath);
    let error: unknown;
    try {
      restoreDatabase({
        source: makeSource(s.dir),
        databasePath: s.databasePath,
        backupDir: s.backupDir,
        clock: fixedClock('2026-11-20T13:00:00.000Z'),
      });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(HttpError);
    expect((error as HttpError).message).toMatch(message);
    expect(readFileSync(s.databasePath).equals(before)).toBe(true);
    expect(listBackups(s.backupDir)).toHaveLength(1);
  });
});

describe('restore command', () => {
  const cli = resolve(import.meta.dirname, '../restore-cli.ts');

  function runCli(args: string[], env: Record<string, string>) {
    return spawnSync(process.execPath, ['--import', 'tsx', cli, ...args], {
      env: { ...process.env, ...env },
      encoding: 'utf8',
    });
  }

  it('takes a backup, adds a transaction, restores, and the transaction is gone', () => {
    const s = scenario();
    const result = runCli([s.backupPath], {
      DATABASE_PATH: s.databasePath,
      BACKUP_DIR: s.backupDir,
    });
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/The replaced database was saved as finance-\d{8}-\d{6}\.sqlite/);
    expect(descriptions(s.databasePath)).toEqual(['BEFORE BACKUP']);
    expect(listBackups(s.backupDir)).toHaveLength(2);
  });

  it('exits with an error and changes nothing for a bad file', () => {
    const s = scenario();
    const result = runCli([join(s.dir, 'missing.sqlite')], {
      DATABASE_PATH: s.databasePath,
      BACKUP_DIR: s.backupDir,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/does not exist/);
    expect(descriptions(s.databasePath)).toEqual(['BEFORE BACKUP', 'AFTER BACKUP']);
  });

  it('prints usage without a file', () => {
    const result = runCli([], {});
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Usage/);
  });
});
