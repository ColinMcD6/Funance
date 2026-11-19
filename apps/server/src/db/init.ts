import type { Clock } from '../clock.js';
import { openDatabase } from './connection.js';
import { createDb, runMigrations, type Db } from './migrate.js';
import { seedDefaults } from './seed.js';

/** Opens the database at `path`, applies pending migrations, and seeds it if it is empty. */
export function initDatabase(path: string, clock: Clock): Db {
  const db = createDb(openDatabase(path));
  try {
    runMigrations(db);
    seedDefaults(db, clock);
  } catch (err) {
    db.$client.close();
    throw err;
  }
  return db;
}
