import type { Category } from '@funance/shared';
import { asc } from 'drizzle-orm';
import type { Db } from '../db/migrate.js';
import { categories } from '../db/schema.js';

/** Every category, archived ones included, in display order. */
export function listCategories(db: Db): Category[] {
  return db.select().from(categories).orderBy(asc(categories.sortOrder), asc(categories.id)).all();
}
