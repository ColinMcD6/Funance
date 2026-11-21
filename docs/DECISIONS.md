# Decisions

Dated contract changes, deviations from [PLAN.md](PLAN.md), and new dependencies. Newest last.

## 2026-11-17 · M0

### Toolchain

- **Node.js 26** (current LTS) pinned in `.nvmrc` and the Dockerfile base image
  `node:26-bookworm-slim`.
- **pnpm 12.21.0** pinned through `packageManager` in `package.json`. Node 26 no longer ships
  Corepack, so pnpm is installed with `npm install -g pnpm`.
- **TypeScript 6.0.x, not 7.0.** TypeScript 7.0.2 is the latest release, but
  `typescript-eslint` 8.73 supports only `>=4.8.4 <6.1.0`. Upgrade once typescript-eslint
  supports 7.
- `pnpm-workspace.yaml` `allowBuilds` lets only `better-sqlite3` (native addon) and `esbuild`
  (binary) run install scripts.

### Dependencies added beyond the stack table in PLAN.md section 1

| Package                                                                                                       | Where      | Why                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `@hono/node-server`                                                                                           | server     | Runs the Hono app on Node and serves `apps/web/dist` (`serveStatic`)                |
| `tsx`                                                                                                         | server dev | `pnpm dev` runs the TypeScript server with watch mode                               |
| `esbuild`                                                                                                     | server dev | `pnpm build` bundles the server and the workspace packages into one `dist/index.js` |
| `@types/better-sqlite3`, `@types/node`, `@types/react`, `@types/react-dom`                                    | dev        | Types                                                                               |
| `@tailwindcss/vite`                                                                                           | web dev    | Tailwind CSS v4 plugin for Vite                                                     |
| `shadcn`, `tw-animate-css`                                                                                    | web dev    | CSS imported by the shadcn/ui theme in `src/index.css` (added by `shadcn init`)     |
| `radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`                                              | web        | Runtime dependencies of shadcn/ui components                                        |
| `jsdom`, `@testing-library/jest-dom`                                                                          | web dev    | DOM environment and matchers for component tests                                    |
| `@vitest/coverage-v8`                                                                                         | root dev   | Coverage for `pnpm test`                                                            |
| `@eslint/js`, `globals`, `eslint-config-prettier`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh` | root dev   | ESLint configuration                                                                |
| `zod`                                                                                                         | web        | Type-only import for the typed API client's schema parameter                        |

### Other M0 choices

- **Extra environment variables.** Besides `PORT` and `DATABASE_PATH`, the server reads `HOST`
  (default `0.0.0.0`) and `STATIC_DIR` (default `apps/web/dist`). Defaults: port 8080, database
  `data/finance.sqlite` relative to the working directory.
- **The database is opened in M0.** The server creates the SQLite file at `DATABASE_PATH` in WAL
  mode with foreign keys on (`apps/server/src/db/connection.ts`). There is no schema yet; M1 adds
  migrations.
- **SPA fallback** returns `index.html` only for GET or HEAD of paths whose last segment has no
  file extension; a missing `/assets/x.js` stays a 404, and unknown `/api/*` routes return the
  JSON error shape with 404.
- **TanStack Query is deferred** to the first milestone with real data screens (M3). The M0 page
  calls the typed client directly.
- **shadcn/ui files** under `apps/web/src/components/ui` are kept as the CLI generates them, so
  they are exempt from "one component per file" and from the `react-refresh` lint rule.
- **Playwright** runs two projects, desktop and a 390 px wide phone viewport, against the built
  server on a fresh database in the OS temp folder. `E2E_BASE_URL` points the same specs at an
  already running app (used to check the Docker container; M10 needs this).
- **Coverage threshold** of 90% lines on `packages/core/src` is enforced from M0.

## 2026-11-18 · M1

M1 defines the contracts, so none of the below is a change to a frozen contract; they are the
choices made where PLAN.md section 2 left room, recorded so later milestones build on them.

### Dependencies

| Package                       | Where      | Why                                                                              |
| ----------------------------- | ---------- | -------------------------------------------------------------------------------- |
| `drizzle-orm` 0.45.4          | server     | ORM in the PLAN.md stack table; latest stable (1.0 is still in beta/rc)          |
| `drizzle-kit` 0.31.11         | server dev | Generates SQL migrations from `db/schema.ts` (`db:generate`)                     |
| `zod`                         | server     | Already used by shared; the server imports schema types directly (contract test) |
| `tsx`                         | root dev   | Runs `fixtures/generate.ts` (`pnpm fixtures:generate`)                           |
| `@funance/core` (workspace)   | server     | The seed copies each account's mapping from the core presets                     |
| `@funance/shared` (workspace) | core       | Core functions are typed with the shared `CsvMapping` and `CsvPreset`            |

### Contract details chosen in M1

- **Shared layout.** `packages/shared/src/primitives.ts` (ids, cents, dates, months, timestamps),
  `csv-mapping.ts`, `entities.ts` (one schema per table, plus the enum value tuples such as
  `CATEGORY_KINDS` that the Drizzle schema reuses), `api.ts` (every request and response).
- **Lists are plain JSON arrays** (`GET /owners`, `/accounts`, `/categories`, ...). Only
  `GET /transactions` is paginated as `{ items, total }`, as PLAN.md says.
- **Imports in API responses omit `rawCsv`** (`importSummarySchema`). `GET /imports/:id` returns
  `{ import, manuallyCategorizedCount }` so the undo confirmation can state the count.
- **Preview response** carries `sameFileImportIds` (the identical-file warning) and
  `legacyOverlapMonths` (ML's informational note). Each `previewRow` has the parsed fields, the
  owner and rule category it would get, `reason` for skipped and error rows, and `raw`.
- **Commit body** is `{ skipLines?: number[] }`, ML's untick-a-row feature, defined now so ML
  needs no contract change. An empty body commits every `new` row.
- **Legacy preview** extends the CSV preview with `monthTotals` (`sheetTotalCents`, the sheet's
  raw sum with spending positive) and structured `violations` (sheet, row, column, rule).
- **Transaction patch** accepts an optional `categorySource` of `manual` (default) or `suggestion`,
  which M7 needs to record an accepted suggestion. `rule` cannot be set by a client.
- **`excluded` query filter** is `true` or `false`; omitted means both.
- **Reports.** Monthly rows carry `categoryId` and `groupName`; both null is the uncategorized
  bucket, and `categoryId` is always null with `groupBy=group`. Compare rows are in each kind's
  own direction (spending, income or saved, positive when normal); a comparison month with no data
  is null. The trailing average covers the 3 months before the month, rounded to whole cents.
- **Other response shapes:** `POST/DELETE /session` return `{ owner | null }`; `DELETE /rules/:id`
  returns `{ deletedId }`; bulk patch and `rules/apply` return `{ changed }`; `PUT /budgets`
  replaces all rows; `POST /backup` returns `{ filename, createdAt, sizeBytes }`.
- **`rawRow`** is a JSON object keyed by header, or an array for headerless files.
- **`rawCsv`** of a legacy import is an empty string (the workbook is binary).

### Schema details

- Enum columns have CHECK constraints; `imports` has a CHECK that a csv import has an account
  and a legacy import has none.
- Extra indexes beyond PLAN.md's list, all for lookups later milestones make:
  `imports(account_id)`, `imports(file_sha256)` (identical-file warning), `rules(priority)`,
  `transactions(import_id)` (undo), `budgets(category_id, effective_from)`.
- `transactions.rule_id` is `ON DELETE SET NULL`, so deleting a rule keeps the categories it set.
- Migrations live in `apps/server/src/db/migrations` (excluded from Prettier, as generated files)
  and are copied to `dist/migrations` by the server build.

### Other M1 choices

- **Seeding runs only on a database with no owners**, so it runs once; edits made later in
  Settings are never overwritten.
- **Presets were written in M1** (`packages/core/src/csv/presets.ts`), because the seed copies
  each account's mapping from them. M2 owns that file and may refine them under its golden tests.
- **Demo data** covers September 2025 to October 2026 (14 months), uses a seeded PRNG and a fixed
  clock, and refuses to run on a database that already has transactions. Its `dedup_key` follows
  the PLAN.md formula; its `merchant_key` values are hand-written, not produced by M2's function.
- **Fixture CSVs use LF line endings** and are marked `-text` in `.gitattributes` so git never
  rewrites their bytes. Check real exports' line endings at H1.

## 2026-11-20 · M2

### Dependencies

| Package           | Where | Why                                                                      |
| ----------------- | ----- | ------------------------------------------------------------------------ |
| `csv-parse` 7.0.3 | core  | CSV parser from the PLAN.md stack table; `csv-parse/sync` splits records |

### Choices made in the CSV engine

- **`parseCsv` takes a `Uint8Array`** (a Node `Buffer` is one), not `Buffer`, so the core library
  stays free of Node types (`packages/core/tsconfig.json` keeps `types: []`).
- **No platform APIs in core.** UTF-8/latin1 decoding (`csv/decode.ts`) and SHA-256
  (`csv/sha256.ts`) are written by hand. SHA-256 is checked against the NIST vectors and against
  `node:crypto` for every fixture row; it yields the same keys as `demo-seed.ts`.
- **`ParsedRow` and `AssignedRow` are defined in core** (`csv/parse-csv.ts`, `csv/occurrences.ts`).
  They are internal results of core functions, not entity or API shapes; their field names match
  `previewRowSchema`, so M4 maps them one to one. Parsed rows carry `merchantKey` and `dedupKey`.
- **Recovery from malformed quoting.** After a bad quote, csv-parse swallows the rest of the file.
  The engine reports the failing record as an `error` row on the line where it starts and restarts
  parsing on the next line, so no row disappears silently.
- **File-level problems become row errors.** Mapped columns missing from the header, or an invalid
  user regex (`bankCategoryRegex`, `skipWhen.matches`), are reported as the reason on every row;
  `parseCsv` never throws on input. A completely blank line is a `skipped` row ("Blank line").
- **Row width.** A row with a different number of fields from the header is an `error`.
- **Dates.** Day and month may have one or two digits in every slash format (a file re-saved by a
  spreadsheet drops the zeros); the year needs four digits; impossible dates are errors.
- **Amounts.** Accepts a sign before or after `$`, parentheses, at most two decimals; more decimals
  are an error rather than rounded. Zero is never `-0`. With `outflow`/`inflow`, amount =
  |inflow| − |outflow|; both empty is an error.
- **`skipWhen`.** An entry skips a row when all of its given tests hold (`notEquals` and
  `matches`); an entry with neither never skips. `matches` is case-insensitive.
- **Account filter** only applies when `accountFilterValue` is set; without one, every row is read.
- **Owner hints** are matched trimmed and case-insensitively against `ownerHintMap` keys.
- **External ids** have every `"` removed (Walmart's `"""…"""` cells).
- **Merchant key.** Commas separate tokens as spaces do (`SAFEWAY #1234, WINNIPEG` →
  `SAFEWAY WINNIPEG MB`). If every token holds a digit, the key is the cleaned description, so it
  is never empty.
- **Headerless files** (`hasHeader: false`) name columns by 1-based number (`"1"`, `"2"`, ...).
- **`raw`** is keyed by the trimmed header name.
- **Golden files** live in `fixtures/expected/<fixture>.json`, checked by
  `fixtures/expected/csv-engine.test.ts`, which imports core by relative path (the repo root has no
  workspace dependency on it). Rewrite with `UPDATE_GOLDEN=1 pnpm vitest run --project fixtures`.
