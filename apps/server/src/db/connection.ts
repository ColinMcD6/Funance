import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export type DatabaseConnection = Database.Database;

/** Opens (creating if needed) the SQLite file at `path`, in WAL mode with foreign keys on. */
export function openDatabase(path: string): DatabaseConnection {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return db;
}
