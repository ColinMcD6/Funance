import {
  commitImportRequestSchema,
  commitImportResponseSchema,
  idParamSchema,
  importDetailResponseSchema,
  importListResponseSchema,
  importPreviewFormSchema,
  importPreviewResponseSchema,
  legacyPreviewResponseSchema,
  undoImportResponseSchema,
} from '@funance/shared';
import { Hono, type Context } from 'hono';
import type { Clock } from '../clock.js';
import type { Db } from '../db/migrate.js';
import { HttpError, parseJsonBody, parseParams } from '../http.js';
import { requireProfile } from '../profile.js';
import {
  commitImport,
  getImportDetail,
  getImportKind,
  listImports,
  previewImport,
  undoImport,
} from '../services/imports.js';
import { commitLegacyImport, previewLegacyImport } from '../services/legacy-imports.js';
import type { RuleEngine } from '../services/rule-engine.js';

/** Reads the multipart form of POST /imports/preview: a `file` and the text fields. */
async function readUpload(c: Context): Promise<{ file: File; fields: Record<string, string> }> {
  let form: Record<string, string | File | (string | File)[]>;
  try {
    form = await c.req.parseBody();
  } catch {
    throw new HttpError(400, 'invalid_form', 'Request body must be multipart form data');
  }
  const { file } = form;
  if (!(file instanceof File)) {
    throw new HttpError(400, 'validation_error', 'Choose a file to import', [
      { path: ['file'], message: 'A file is required' },
    ]);
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(form)) {
    if (typeof value === 'string') fields[key] = value;
  }
  return { file, fields };
}

/** POST /imports/preview, POST /imports/legacy/preview, POST /imports/:id/commit, POST /imports/:id/undo, GET /imports(/:id). */
export function importRoutes(db: Db, clock: Clock, ruleEngine: RuleEngine): Hono {
  const routes = new Hono();

  routes.get('/', (c) => c.json(importListResponseSchema.parse(listImports(db))));

  routes.post('/preview', async (c) => {
    const profile = requireProfile(c, db);
    const { file, fields } = await readUpload(c);
    const result = importPreviewFormSchema.safeParse(fields);
    if (!result.success) {
      throw new HttpError(400, 'validation_error', 'Invalid form fields', result.error.issues);
    }
    const preview = previewImport(db, clock, ruleEngine, {
      accountId: result.data.accountId,
      filename: file.name === '' ? 'upload.csv' : file.name,
      content: new Uint8Array(await file.arrayBuffer()),
      uploadedByOwnerId: profile.id,
    });
    return c.json(importPreviewResponseSchema.parse(preview), 201);
  });

  routes.post('/legacy/preview', async (c) => {
    const profile = requireProfile(c, db);
    const { file } = await readUpload(c);
    const preview = await previewLegacyImport(db, clock, {
      filename: file.name === '' ? 'upload.xlsx' : file.name,
      content: new Uint8Array(await file.arrayBuffer()),
      uploadedByOwnerId: profile.id,
    });
    return c.json(legacyPreviewResponseSchema.parse(preview), 201);
  });

  routes.get('/:id', (c) => {
    const { id } = parseParams(c, idParamSchema);
    return c.json(importDetailResponseSchema.parse(getImportDetail(db, id)));
  });

  routes.post('/:id/commit', async (c) => {
    const { id } = parseParams(c, idParamSchema);
    // A request without a JSON body commits every new row.
    const body =
      c.req.header('content-type') === undefined
        ? commitImportRequestSchema.parse({})
        : await parseJsonBody(c, commitImportRequestSchema);
    const summary =
      getImportKind(db, id) === 'legacy'
        ? await commitLegacyImport(db, clock, id, body.skipLines)
        : commitImport(db, clock, ruleEngine, id, body.skipLines);
    return c.json(commitImportResponseSchema.parse(summary));
  });

  routes.post('/:id/undo', (c) => {
    const { id } = parseParams(c, idParamSchema);
    return c.json(undoImportResponseSchema.parse(undoImport(db, clock, id)));
  });

  return routes;
}
