import type {
  Account,
  CreateAccountRequest,
  CsvMapping,
  UpdateAccountRequest,
} from '@funance/shared';
import { and, asc, eq, inArray, ne } from 'drizzle-orm';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { accounts, owners } from '../db/schema.js';
import { HttpError, notFound } from '../http.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** Every account, archived ones included, active first and then by name. */
export function listAccounts(db: Db): Account[] {
  return db.select().from(accounts).orderBy(asc(accounts.archived), asc(accounts.name)).all();
}

/** 400 when the default owner or any owner-hint target is not an owner. */
function checkOwnerReferences(tx: Tx, defaultOwnerId?: number, mapping?: CsvMapping): void {
  const wanted = new Set<number>();
  if (defaultOwnerId !== undefined) wanted.add(defaultOwnerId);
  for (const id of Object.values(mapping?.ownerHintMap ?? {})) wanted.add(id);
  if (wanted.size === 0) return;
  const found = new Set(
    tx
      .select({ id: owners.id })
      .from(owners)
      .where(inArray(owners.id, [...wanted]))
      .all()
      .map((o) => o.id),
  );
  const missing = [...wanted].filter((id) => !found.has(id));
  if (missing.length > 0) {
    throw new HttpError(
      400,
      'invalid_reference',
      `Unknown owner id: ${missing.join(', ')}`,
      missing,
    );
  }
}

/** 409 when another account (other than `exceptId`) already has `name`. */
function checkNameFree(tx: Tx, name: string, exceptId?: number): void {
  const clash = tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      exceptId === undefined
        ? eq(accounts.name, name)
        : and(eq(accounts.name, name), ne(accounts.id, exceptId)),
    )
    .get();
  if (clash !== undefined) {
    throw new HttpError(409, 'conflict', `An account named "${name}" already exists`);
  }
}

export function createAccount(db: Db, clock: Clock, input: CreateAccountRequest): Account {
  return db.transaction((tx) => {
    checkNameFree(tx, input.name);
    checkOwnerReferences(tx, input.defaultOwnerId, input.csvMapping);
    return tx
      .insert(accounts)
      .values({ ...input, archived: false, createdAt: clock() })
      .returning()
      .get();
  });
}

/** Applies a partial edit; archiving is `archived: true`. 404 when the account does not exist. */
export function updateAccount(db: Db, id: number, patch: UpdateAccountRequest): Account {
  return db.transaction((tx) => {
    const current = tx.select().from(accounts).where(eq(accounts.id, id)).get();
    if (current === undefined) throw notFound('Account', id);
    if (patch.name !== undefined) checkNameFree(tx, patch.name, id);
    checkOwnerReferences(tx, patch.defaultOwnerId, patch.csvMapping);
    if (Object.keys(patch).length === 0) return current;
    return tx.update(accounts).set(patch).where(eq(accounts.id, id)).returning().get();
  });
}
