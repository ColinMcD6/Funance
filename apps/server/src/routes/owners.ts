import {
  idParamSchema,
  ownerListResponseSchema,
  updateOwnerRequestSchema,
  updateOwnerResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Db } from '../db/migrate.js';
import { parseJsonBody, parseParams } from '../http.js';
import { listOwners, renameOwner } from '../services/owners.js';

/** GET /owners, PATCH /owners/:id */
export function ownerRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(ownerListResponseSchema.parse(listOwners(db))));

  routes.patch('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    const { name } = await parseJsonBody(c, updateOwnerRequestSchema);
    return c.json(updateOwnerResponseSchema.parse(renameOwner(db, id, name)));
  });

  return routes;
}
