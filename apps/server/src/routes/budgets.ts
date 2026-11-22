import {
  budgetListResponseSchema,
  putBudgetsRequestSchema,
  putBudgetsResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Db } from '../db/migrate.js';
import { parseJsonBody } from '../http.js';
import { listBudgets, replaceBudgets } from '../services/budgets.js';

/** GET /budgets, PUT /budgets (replaces every row). */
export function budgetRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(budgetListResponseSchema.parse(listBudgets(db))));

  routes.put('/', async (c) => {
    const { budgets } = await parseJsonBody(c, putBudgetsRequestSchema);
    return c.json(putBudgetsResponseSchema.parse(replaceBudgets(db, budgets)));
  });

  return routes;
}
