import {
  changedCountResponseSchema,
  createRuleRequestSchema,
  createRuleResponseSchema,
  deleteRuleResponseSchema,
  idParamSchema,
  ruleListResponseSchema,
  testRuleRequestSchema,
  testRuleResponseSchema,
  updateRuleRequestSchema,
  updateRuleResponseSchema,
} from '@funance/shared';
import { Hono } from 'hono';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { parseJsonBody, parseParams } from '../http.js';
import {
  applyRules,
  createRule,
  deleteRule,
  listRules,
  testRule,
  updateRule,
} from '../services/rules.js';

/** GET, POST /rules, PATCH, DELETE /rules/:id, POST /rules/test, POST /rules/apply. */
export function ruleRoutes(db: Db, clock: Clock): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(ruleListResponseSchema.parse(listRules(db))));

  routes.post('/', async (c) => {
    const body = await parseJsonBody(c, createRuleRequestSchema);
    return c.json(createRuleResponseSchema.parse(createRule(db, clock, body)), 201);
  });

  routes.post('/test', async (c) => {
    const body = await parseJsonBody(c, testRuleRequestSchema);
    return c.json(testRuleResponseSchema.parse(testRule(db, body)));
  });

  routes.post('/apply', (c) =>
    c.json(changedCountResponseSchema.parse({ changed: applyRules(db, clock) })),
  );

  routes.patch('/:id', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    const body = await parseJsonBody(c, updateRuleRequestSchema);
    return c.json(updateRuleResponseSchema.parse(updateRule(db, id, body)));
  });

  routes.delete('/:id', (c) => {
    const { id } = parseParams(c, idParamSchema);
    return c.json(deleteRuleResponseSchema.parse({ deletedId: deleteRule(db, id) }));
  });

  return routes;
}
