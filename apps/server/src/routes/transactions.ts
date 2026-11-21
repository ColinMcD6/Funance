import {
  bulkTransactionRequestSchema,
  changedCountResponseSchema,
  idParamSchema,
  transactionListResponseSchema,
  transactionPatchSchema,
  transactionQuerySchema,
  updateTransactionResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { parseJsonBody, parseParams, parseQuery } from '../http.js';
import {
  bulkUpdateTransactions,
  listTransactions,
  updateTransaction,
} from '../services/transactions.js';

/** GET /transactions, PATCH /transactions/:id, POST /transactions/bulk. */
export function transactionRoutes(db: Db, clock: Clock): Hono {
  const routes = new Hono();

  routes.get('/', (c) => {
    const query = parseQuery(c, transactionQuerySchema);
    return c.json(transactionListResponseSchema.parse(listTransactions(db, query)));
  });

  routes.post('/bulk', async (c) => {
    const { ids, patch } = await parseJsonBody(c, bulkTransactionRequestSchema);
    const changed = bulkUpdateTransactions(db, clock, ids, patch);
    return c.json(changedCountResponseSchema.parse({ changed }));
  });

  routes.patch('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    const patch = await parseJsonBody(c, transactionPatchSchema);
    return c.json(updateTransactionResponseSchema.parse(updateTransaction(db, clock, id, patch)));
  });

  return routes;
}
