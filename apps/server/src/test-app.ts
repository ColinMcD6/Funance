import { join } from 'node:path';
import { createApp, type AppOptions } from './app.js';
import { fixedClock, type Clock } from './clock.js';
import { initDatabase } from './db/init.js';
import type { Db } from './db/migrate.js';
import { createBackupService } from './services/backup.js';

export const TEST_NOW = '2026-11-20T12:00:00.000Z';

let counter = 0;

export type TestAppOptions = Partial<Omit<AppOptions, 'db'>> & {
  /** Switches backups on, written to this folder. */
  backupDir?: string;
  /** The clock that names backups; defaults to the app's clock. */
  backupClock?: Clock;
};

/**
 * A fresh migrated and seeded database in `dir` and an app on it with a fixed clock. Each call
 * gets its own file, so tests never share data.
 */
export function makeTestApp(dir: string, options: TestAppOptions = {}) {
  counter += 1;
  const { backupDir, backupClock, ...appOptions } = options;
  const clock = appOptions.clock ?? fixedClock(TEST_NOW);
  const db: Db = initDatabase(join(dir, `test-${process.pid}-${counter}.sqlite`), clock);
  const backups =
    backupDir === undefined
      ? undefined
      : createBackupService(db.$client, backupClock ?? clock, backupDir);
  const app = createApp({ version: '0.0.0-test', db, clock, backups, ...appOptions });
  return { app, db, close: () => db.$client.close() };
}
