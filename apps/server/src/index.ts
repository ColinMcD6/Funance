import { serve } from '@hono/node-server';
import packageJson from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { systemClock } from './clock.js';
import { initDatabase } from './db/init.js';

const config = readConfig();
// Creates the file if needed, applies migrations, and seeds an empty database.
const db = initDatabase(config.databasePath, systemClock);
const app = createApp({ version: packageJson.version, db, staticDir: config.staticDir });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Finance tracker listening on http://${config.host}:${info.port}`);
  console.log(`Database: ${config.databasePath}`);
});

function shutdown(): void {
  server.close(() => {
    db.$client.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
