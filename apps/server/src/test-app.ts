import { join } from 'node:path';
import { createApp, type AppOptions } from './app.js';
import { fixedClock } from './clock.js';
import { initDatabase } from './db/init.js';
import type { Db } from './db/migrate.js';

export const TEST_NOW = '2026-11-20T12:00:00.000Z';

let counter = 0;

/**
 * A fresh migrated and seeded database in `dir` and an app on it with a fixed clock. Each call
 * gets its own file, so tests never share data.
 */
export function makeTestApp(dir: string, options: Partial<AppOptions> = {}) {
  counter += 1;
  const clock = fixedClock(TEST_NOW);
  const db: Db = initDatabase(join(dir, `test-${process.pid}-${counter}.sqlite`), clock);
  const app = createApp({ version: '0.0.0-test', db, clock, ...options });
  return { app, db, close: () => db.$client.close() };
}
