/**
 * Replaces the database with a backup file. The app must be stopped first; scripts/restore does
 * that and runs this inside the container (`node apps/server/dist/restore.js <file>`).
 * Reads DATABASE_PATH and BACKUP_DIR like the server.
 */
import { resolve } from 'node:path';
import { systemClock } from './clock.js';
import { readConfig } from './config.js';
import { HttpError } from './http.js';
import { restoreDatabase } from './services/backup.js';

const source = process.argv[2];
if (source === undefined || process.argv.length > 3) {
  console.error('Usage: restore <backup-file>');
  process.exit(2);
}

const config = readConfig();
try {
  const { safetyBackup } = restoreDatabase({
    source: resolve(source),
    databasePath: config.databasePath,
    backupDir: config.backupDir,
    clock: systemClock,
  });
  if (safetyBackup !== undefined) {
    console.log(`The replaced database was saved as ${safetyBackup.filename}`);
  }
  console.log(`Restored ${source} to ${config.databasePath}`);
} catch (err) {
  console.error(err instanceof HttpError ? err.message : err);
  process.exit(1);
}
