import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** A fresh folder in the OS temp directory for one test file's SQLite databases. */
export function makeTempDir(prefix = 'funance-test-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Every user table with its full contents, ordered by id, for before-and-after comparisons. */
export function dumpTables(connection: {
  prepare: (sql: string) => { all: () => unknown[] };
}): Record<string, unknown[]> {
  const tables = connection
    .prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '__drizzle%' order by name",
    )
    .all() as { name: string }[];
  return Object.fromEntries(
    tables.map(({ name }) => [
      name,
      connection.prepare(`select * from "${name}" order by id`).all(),
    ]),
  );
}
