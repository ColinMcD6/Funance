import {
  archiveCategoryQuerySchema,
  archiveCategoryResponseSchema,
  categoryListResponseSchema,
  createCategoryRequestSchema,
  createCategoryResponseSchema,
  idParamSchema,
  updateCategoryRequestSchema,
  updateCategoryResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { parseJsonBody, parseParams, parseQuery } from '../http.js';
import {
  archiveCategory,
  createCategory,
  listCategories,
  updateCategory,
} from '../services/categories.js';

/** GET, POST /categories, PATCH /categories/:id, DELETE /categories/:id (archives). */
export function categoryRoutes(db: Db, clock: Clock): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(categoryListResponseSchema.parse(listCategories(db))));

  routes.post('/', async (c) => {
    const body = await parseJsonBody(c, createCategoryRequestSchema);
    return c.json(createCategoryResponseSchema.parse(createCategory(db, body)), 201);
  });

  routes.patch('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    const body = await parseJsonBody(c, updateCategoryRequestSchema);
    return c.json(updateCategoryResponseSchema.parse(updateCategory(db, clock, id, body)));
  });

  routes.delete('/:id', (c) => {
    const { id } = parseParams(c, idParamSchema);
    const { reassignTo } = parseQuery(c, archiveCategoryQuerySchema);
    return c.json(archiveCategoryResponseSchema.parse(archiveCategory(db, clock, id, reassignTo)));
  });

  return routes;
}
