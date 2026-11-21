import { createSessionRequestSchema, PROFILE_COOKIE, sessionResponseSchema } from '@funance/shared';
import { Hono } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import type { Db } from '../db/migrate.js';
import { parseJsonBody } from '../http.js';
import { requireProfileOwner } from '../services/owners.js';

/** One year: the profile stays chosen on a device until switched. */
const PROFILE_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;

/**
 * POST /session sets the profile cookie; DELETE /session clears it. The cookie is readable by
 * the web app (not HttpOnly), which is how it learns the active profile; it is not a secret.
 */
export function sessionRoutes(db: Db): Hono {
  const routes = new Hono();

  routes.post('/', async (c) => {
    const { ownerId } = await parseJsonBody(c, createSessionRequestSchema);
    const owner = requireProfileOwner(db, ownerId);
    setCookie(c, PROFILE_COOKIE, String(owner.id), {
      path: '/',
      sameSite: 'Lax',
      maxAge: PROFILE_MAX_AGE_SECONDS,
    });
    return c.json(sessionResponseSchema.parse({ owner }));
  });

  routes.delete('/', (c) => {
    deleteCookie(c, PROFILE_COOKIE, { path: '/' });
    return c.json(sessionResponseSchema.parse({ owner: null }));
  });

  return routes;
}
