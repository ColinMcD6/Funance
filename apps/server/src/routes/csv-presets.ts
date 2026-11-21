import { csvPresets } from '@funance/core';
import { csvPresetListResponseSchema } from '@funance/shared';
import { Hono } from 'hono';

/** GET /csv-presets: the preset mappings offered by the account form. */
export function csvPresetRoutes(): Hono {
  const routes = new Hono();
  routes.get('/', (c) => c.json(csvPresetListResponseSchema.parse(csvPresets)));
  return routes;
}
