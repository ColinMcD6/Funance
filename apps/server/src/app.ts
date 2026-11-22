import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serveStatic } from '@hono/node-server/serve-static';
import { healthResponseSchema } from '@funance/shared';
import { Hono } from 'hono';
import { systemClock, type Clock } from './clock.js';
import type { Db } from './db/migrate.js';
import { errorResponse, HttpError } from './http.js';
import { accountRoutes } from './routes/accounts.js';
import { csvPresetRoutes } from './routes/csv-presets.js';
import { importRoutes } from './routes/imports.js';
import { ownerRoutes } from './routes/owners.js';
import { sessionRoutes } from './routes/session.js';
import { transactionRoutes } from './routes/transactions.js';
import { categoryRoutes } from './routes/categories.js';
import { ruleRoutes } from './routes/rules.js';
import { reportRoutes } from './routes/reports.js';
import { budgetRoutes } from './routes/budgets.js';
import { databaseRuleEngine, type RuleEngine } from './services/rule-engine.js';

export type AppOptions = {
  version: string;
  /** The migrated, seeded database. */
  db: Db;
  /** Source of timestamps; tests inject a fixed clock. */
  clock?: Clock;
  /** Categorizes imported rows; defaults to the database's rules. */
  ruleEngine?: RuleEngine;
  /** Directory holding the built web app; when absent, only the API is served. */
  staticDir?: string;
};

/** Builds the Hono app. Tests call `app.request()` on it without opening a port. */
export function createApp(options: AppOptions): Hono {
  const { db, clock = systemClock, ruleEngine = databaseRuleEngine } = options;
  const app = new Hono();
  const api = new Hono();

  // API routes: append one line per resource.
  api.get('/health', (c) =>
    c.json(healthResponseSchema.parse({ status: 'ok', version: options.version })),
  );
  api.route('/owners', ownerRoutes(db));
  api.route('/session', sessionRoutes(db));
  api.route('/accounts', accountRoutes(db, clock));
  api.route('/csv-presets', csvPresetRoutes());
  api.route('/imports', importRoutes(db, clock, ruleEngine));
  api.route('/transactions', transactionRoutes(db, clock));
  api.route('/categories', categoryRoutes(db, clock));
  api.route('/rules', ruleRoutes(db, clock));
  api.route('/reports', reportRoutes(db));
  api.route('/budgets', budgetRoutes(db));

  app.route('/api', api);

  // Built web assets. API routes are matched first; a miss falls through to notFound below.
  const { staticDir } = options;
  if (staticDir !== undefined) {
    app.use('*', serveStatic({ root: staticDir }));
  }

  app.notFound((c) => {
    const { path, method } = c.req;
    if (path === '/api' || path.startsWith('/api/')) {
      return errorResponse(c, 404, 'not_found', `No route for ${method} ${path}`);
    }
    // SPA fallback: unknown page paths get index.html; unknown files stay 404.
    const lastSegment = path.split('/').pop() ?? '';
    const indexPath = staticDir === undefined ? undefined : join(staticDir, 'index.html');
    if (
      (method === 'GET' || method === 'HEAD') &&
      !lastSegment.includes('.') &&
      indexPath !== undefined &&
      existsSync(indexPath)
    ) {
      return c.html(readFileSync(indexPath, 'utf8'));
    }
    return c.text('Not found', 404);
  });

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return errorResponse(c, err.status, err.code, err.message, err.details);
    }
    console.error(err);
    return errorResponse(c, 500, 'internal', 'Internal server error');
  });

  return app;
}
