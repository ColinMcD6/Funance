import { categoryListResponseSchema } from '@funance/shared';
import { Hono } from 'hono';
import type { Db } from '../db/migrate.js';
import { listCategories } from '../services/categories.js';

/** GET /categories. M6 adds POST, PATCH and DELETE. */
export function categoryRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(categoryListResponseSchema.parse(listCategories(db))));

  return routes;
}
