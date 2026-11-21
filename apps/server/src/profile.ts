import { PROFILE_COOKIE, type Owner } from '@funance/shared';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Db } from './db/migrate.js';
import { HttpError } from './http.js';
import { findProfile } from './services/owners.js';

/** The active profile named by the request's `profile` cookie, or undefined. */
export function activeProfile(c: Context, db: Db): Owner | undefined {
  return findProfile(db, getCookie(c, PROFILE_COOKIE));
}

/** The active profile; 401 without one. For routes that record who acted (imports). */
export function requireProfile(c: Context, db: Db): Owner {
  const owner = activeProfile(c, db);
  if (owner === undefined) {
    throw new HttpError(401, 'no_profile', 'Choose a profile first');
  }
  return owner;
}
