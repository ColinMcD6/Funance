import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';

describe('openDatabase', () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true });
  });

  it('creates missing folders and the file, in WAL mode with foreign keys on', () => {
    dir = mkdtempSync(join(tmpdir(), 'funance-db-'));
    const path = join(dir, 'nested', 'finance.sqlite');
    const db = openDatabase(path);
    try {
      expect(existsSync(path)).toBe(true);
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    } finally {
      db.close();
    }
  });
});
