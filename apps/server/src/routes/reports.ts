import {
  compareReportQuerySchema,
  compareReportResponseSchema,
  monthlyReportQuerySchema,
  monthlyReportResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Db } from '../db/migrate.js';
import { parseQuery } from '../http.js';
import { compareReport, monthlyReport } from '../services/reports.js';

/** GET /reports/monthly, GET /reports/compare. */
export function reportRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.get('/monthly', (c) => {
    const query = parseQuery(c, monthlyReportQuerySchema);
    return c.json(monthlyReportResponseSchema.parse(monthlyReport(db, query)));
  });

  routes.get('/compare', (c) => {
    const query = parseQuery(c, compareReportQuerySchema);
    return c.json(compareReportResponseSchema.parse(compareReport(db, query)));
  });

  return routes;
}
