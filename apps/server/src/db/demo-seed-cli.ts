// `pnpm seed:demo`: fills the database at DATABASE_PATH (default data/finance.sqlite, relative to
// apps/server, the same file `pnpm dev` uses) with synthetic demo data. Never point it at real data.
import { fixedClock } from '../clock.js';
import { readConfig } from '../config.js';
import { formatCents } from '@funance/core';
import { seedDemo } from './demo-seed.js';
import { initDatabase } from './init.js';

const clock = fixedClock('2026-11-01T00:00:00.000Z');
const { databasePath } = readConfig();
const db = initDatabase(databasePath, clock);
try {
  const summary = seedDemo(db, { clock });
  console.log(`Demo data written to ${databasePath}`);
  console.log(
    `${summary.imports} imports, ${summary.transactions} transactions ` +
      `(${summary.categorized} categorized), net ${formatCents(summary.totalCents)}`,
  );
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  db.$client.close();
}
