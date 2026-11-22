import { readFileSync } from 'node:fs';
import { backupResponseSchema } from '@funance/shared';
import { Hono } from 'hono';
import { HttpError } from '../http.js';
import type { BackupService } from '../services/backup.js';

/** POST /backup takes a backup now; GET /backup/latest downloads the newest file. */
export function backupRoutes(backups: BackupService | undefined): Hono {
  const routes = new Hono();

  function service(): BackupService {
    if (backups === undefined) {
      throw new HttpError(409, 'backups_disabled', 'Backups are not configured on this server');
    }
    return backups;
  }

  routes.post('/', (c) => c.json(backupResponseSchema.parse(service().take()), 201));

  routes.get('/latest', (c) => {
    const latest = service().latest();
    if (latest === undefined) {
      throw new HttpError(404, 'not_found', 'No backup has been taken yet');
    }
    return c.body(readFileSync(latest.path), 200, {
      'Content-Type': 'application/vnd.sqlite3',
      'Content-Disposition': `attachment; filename="${latest.filename}"`,
      'Cache-Control': 'no-store',
    });
  });

  return routes;
}
