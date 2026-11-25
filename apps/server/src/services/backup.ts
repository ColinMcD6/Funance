import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { BackupResponse } from '@funance/shared';
import Database from 'better-sqlite3';
import type { Clock } from '../clock.js';
import { HttpError } from '../http.js';

/** How many backup files are kept; older ones are deleted after each new backup. */
export const BACKUP_RETENTION = 30;

/** `finance-YYYYMMDD-HHMMSS.sqlite`, the only files the backup folder manages. */
const BACKUP_NAME = /^finance-\d{8}-\d{6}\.sqlite$/;

/** The app's open connection or a fresh one; both can run `VACUUM INTO`. */
type Connection = Database.Database;

/** `2026-11-20T12:34:56.789Z` becomes `finance-20261120-123456.sqlite` (UTC). */
export function backupFilename(timestamp: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(timestamp);
  if (match === null) throw new Error(`Not an ISO timestamp: ${timestamp}`);
  const [, y, mo, d, h, mi, s] = match;
  return `finance-${y}${mo}${d}-${h}${mi}${s}.sqlite`;
}

/** The backup files in `dir`, oldest first (the names sort by time). Missing folder: none. */
export function listBackups(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => BACKUP_NAME.test(name))
    .sort();
}

/** Deletes the oldest backups so that at most `keep` remain. Returns the deleted names. */
export function pruneBackups(dir: string, keep: number): string[] {
  const names = listBackups(dir);
  const doomed = names.slice(0, Math.max(0, names.length - keep));
  for (const name of doomed) rmSync(join(dir, name), { force: true });
  return doomed;
}

/**
 * Writes a consistent snapshot of `connection` to `dir` with `VACUUM INTO`, then applies the
 * retention. The snapshot is written under a temporary name and renamed, so the folder never
 * holds a half-written backup; a second backup in the same second replaces the first.
 */
export function writeBackup(
  connection: Connection,
  dir: string,
  timestamp: string,
  keep: number = BACKUP_RETENTION,
): BackupResponse {
  mkdirSync(dir, { recursive: true });
  const filename = backupFilename(timestamp);
  const target = join(dir, filename);
  const temporary = join(dir, `.${filename}.partial`);
  rmSync(temporary, { force: true });
  connection.prepare('VACUUM INTO ?').run(temporary);
  renameSync(temporary, target);
  pruneBackups(dir, keep);
  return { filename, createdAt: timestamp, sizeBytes: statSync(target).size };
}

export type BackupService = {
  /** Takes a backup now. */
  take: () => BackupResponse;
  /** The newest backup file, or undefined when there is none. */
  latest: () => { filename: string; path: string } | undefined;
};

/** Backups of the app's database into `dir`, keeping the newest `keep`. */
export function createBackupService(
  connection: Connection,
  clock: Clock,
  dir: string,
  keep: number = BACKUP_RETENTION,
): BackupService {
  return {
    take: () => writeBackup(connection, dir, clock(), keep),
    latest: () => {
      const filename = listBackups(dir).at(-1);
      return filename === undefined ? undefined : { filename, path: join(dir, filename) };
    },
  };
}

/** Throws a 400 unless `path` is a readable SQLite database that holds this app's tables. */
export function checkBackupFile(path: string): void {
  if (!existsSync(path)) {
    throw new HttpError(400, 'invalid_backup', `${path} does not exist`);
  }
  let connection: Database.Database | undefined;
  try {
    connection = new Database(path, { readonly: true, fileMustExist: true });
    const integrity = connection.pragma('integrity_check', { simple: true });
    if (integrity !== 'ok') {
      throw new HttpError(400, 'invalid_backup', `${path} fails SQLite's integrity check`);
    }
    const table = connection
      .prepare("select name from sqlite_master where type = 'table' and name = 'transactions'")
      .get();
    if (table === undefined) {
      throw new HttpError(400, 'invalid_backup', `${path} is not a Finance Tracker database`);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, 'invalid_backup', `${path} is not a SQLite database`);
  } finally {
    connection?.close();
  }
}

export type RestoreResult = {
  /** The backup taken of the database that was replaced, when there was one. */
  safetyBackup: BackupResponse | undefined;
};

/**
 * Replaces the database at `databasePath` with the backup file `source`. The app must be
 * stopped. The source is checked first, and the current database (if any) is backed up into
 * `backupDir` before it is replaced, so a restore can itself be undone.
 */
export function restoreDatabase(options: {
  source: string;
  databasePath: string;
  backupDir: string;
  clock: Clock;
  keep?: number;
}): RestoreResult {
  const { source, databasePath, backupDir, clock, keep = BACKUP_RETENTION } = options;
  checkBackupFile(source);

  // Copy the source aside first: the safety backup's retention may delete the source itself
  // when it is the oldest file in the backup folder.
  mkdirSync(dirname(databasePath), { recursive: true });
  const staged = `${databasePath}.restoring`;
  copyFileSync(source, staged);

  let safetyBackup: BackupResponse | undefined;
  if (existsSync(databasePath)) {
    const current = new Database(databasePath, { fileMustExist: true });
    try {
      safetyBackup = writeBackup(current, backupDir, clock(), keep);
    } finally {
      current.close();
    }
  }

  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
  renameSync(staged, databasePath);
  return { safetyBackup };
}
