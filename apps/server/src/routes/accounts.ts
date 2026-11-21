import {
  accountListResponseSchema,
  createAccountRequestSchema,
  createAccountResponseSchema,
  idParamSchema,
  updateAccountRequestSchema,
  updateAccountResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { parseJsonBody, parseParams } from '../http.js';
import { createAccount, listAccounts, updateAccount } from '../services/accounts.js';

/** GET, POST /accounts, PATCH /accounts/:id (archive with `archived: true`). */
export function accountRoutes(db: Db, clock: Clock): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(accountListResponseSchema.parse(listAccounts(db))));

  routes.post('/', async (c) => {
    const body = await parseJsonBody(c, createAccountRequestSchema);
    return c.json(createAccountResponseSchema.parse(createAccount(db, clock, body)), 201);
  });

  routes.patch('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    const body = await parseJsonBody(c, updateAccountRequestSchema);
    return c.json(updateAccountResponseSchema.parse(updateAccount(db, id, body)));
  });

  return routes;
}
