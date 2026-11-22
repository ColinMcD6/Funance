import { serve } from '@hono/node-server';
import packageJson from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { systemClock } from './clock.js';
import { initDatabase } from './db/init.js';
import { createBackupService } from './services/backup.js';
import { deleteStalePreviews } from './services/imports.js';

const config = readConfig();
// Creates the file if needed, applies migrations, and seeds an empty database.
const db = initDatabase(config.databasePath, systemClock);
const stalePreviews = deleteStalePreviews(db, systemClock);
if (stalePreviews > 0)
  console.log(`Deleted ${stalePreviews} import preview(s) older than 24 hours`);

// A backup at every start; a failure is logged and the app still starts.
const backups = createBackupService(db.$client, systemClock, config.backupDir);
try {
  const backup = backups.take();
  console.log(`Backup written: ${backup.filename}`);
} catch (err) {
  console.error(`Backup at start failed (folder ${config.backupDir})`, err);
}

const app = createApp({
  version: packageJson.version,
  db,
  backups,
  staticDir: config.staticDir,
});

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Finance tracker listening on http://${config.host}:${info.port}`);
  console.log(`Database: ${config.databasePath}`);
  console.log(`Backups: ${config.backupDir}`);
});

function shutdown(): void {
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
