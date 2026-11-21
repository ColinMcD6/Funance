import type { Owner } from '@funance/shared';
import { and, asc, eq, ne } from 'drizzle-orm';
import type { Db } from '../db/migrate.js';
import { owners } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';

/** Every owner in display order. */
export function listOwners(db: Db): Owner[] {
  return db.select().from(owners).orderBy(asc(owners.sortOrder), asc(owners.id)).all();
}

/** The owner with this id, or undefined. */
export function findOwner(db: Db, id: number): Owner | undefined {
  return db.select().from(owners).where(eq(owners.id, id)).get();
}

/** Renames an owner. 404 when it does not exist, 409 when another owner has the name. */
export function renameOwner(db: Db, id: number, name: string): Owner {
  return db.transaction((tx) => {
    const owner = tx.select().from(owners).where(eq(owners.id, id)).get();
    if (owner === undefined) throw notFound('Owner', id);
    const clash = tx
      .select({ id: owners.id })
      .from(owners)
      .where(and(eq(owners.name, name), ne(owners.id, id)))
      .get();
    if (clash !== undefined) {
      throw new HttpError(409, 'conflict', `Another owner is already named "${name}"`);
    }
    return tx.update(owners).set({ name }).where(eq(owners.id, id)).returning().get();
  });
}

/**
 * The owner a profile cookie names, when it is a person (only the two `person` owners are
 * profiles). Undefined for a missing, malformed, unknown, or joint id.
 */
export function findProfile(db: Db, cookieValue: string | undefined): Owner | undefined {
  if (cookieValue === undefined || !/^[1-9]\d{0,9}$/.test(cookieValue)) return undefined;
  const owner = findOwner(db, Number(cookieValue));
  return owner?.kind === 'person' ? owner : undefined;
}

/** Checks that `id` can become the active profile: 404 when missing, 400 for the joint owner. */
export function requireProfileOwner(db: Db, id: number): Owner {
  const owner = findOwner(db, id);
  if (owner === undefined) throw notFound('Owner', id);
  if (owner.kind !== 'person') {
    throw new HttpError(400, 'not_a_profile', `${owner.name} is not a person and cannot sign in`);
  }
  return owner;
}
