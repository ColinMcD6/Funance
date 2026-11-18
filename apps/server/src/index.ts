import { serve } from '@hono/node-server';
import packageJson from '../package.json' with { type: 'json' };
import { createApp } from './app.js';
import { readConfig } from './config.js';
import { openDatabase } from './db/connection.js';

const config = readConfig();
const db = openDatabase(config.databasePath);
const app = createApp({ version: packageJson.version, staticDir: config.staticDir });

const server = serve({ fetch: app.fetch, port: config.port, hostname: config.host }, (info) => {
  console.log(`Finance tracker listening on http://${config.host}:${info.port}`);
  console.log(`Database: ${config.databasePath}`);
});

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
