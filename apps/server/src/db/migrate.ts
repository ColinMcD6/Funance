import { resolve } from 'node:path';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseConnection } from './connection.js';
import { schema } from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: DatabaseConnection };

/**
 * Where the SQL migrations live: `src/db/migrations` next to this file in development, and
 * `dist/migrations` next to the bundle (copied there by build.mjs).
 */
export const MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'migrations');

/** Wraps an open connection in a typed Drizzle instance. */
export function createDb(connection: DatabaseConnection): Db {
  return drizzle(connection, { schema });
}

/** Applies every migration not yet recorded in the database. Safe to run on every start. */
export function runMigrations(db: Db, migrationsFolder: string = MIGRATIONS_FOLDER): void {
  migrate(db, { migrationsFolder });
}
