# Status

Milestone log. Every session appends an entry: what was built, deviations, follow-ups.
Plan: [PLAN.md](PLAN.md). Deviations and new dependencies: [DECISIONS.md](DECISIONS.md).

| Milestone                            | State             |
| ------------------------------------ | ----------------- |
| M0 Scaffold and tooling              | Done              |
| M1 Contracts, schema, seed, fixtures | Done, awaiting H1 |
| M2 CSV engine                        | Done              |
| M3, M5 (parallel after H1)           | Next              |
| M4, M6 to M10, ML                    | Not started       |

## M0: Scaffold and tooling (2026-11-17, branch `m0-scaffold`)

### Built

- pnpm workspace: `packages/shared`, `packages/core`, `apps/server`, `apps/web`, with a strict
  shared `tsconfig.base.json`.
- Tooling: Prettier, ESLint (typescript-eslint strict type-checked, zero warnings), Vitest
  (one root config with a project per package, v8 coverage, 90% lines enforced on core),
  Playwright (desktop and 390 px phone projects). Root scripts as in PLAN.md section 6.
- `packages/shared`: `healthResponseSchema` and the API error schema in `src/api.ts`.
- `packages/core`: `formatCents` in `src/money.ts`.
- `apps/server`: Hono app (`src/app.ts`) with `GET /api/health`, JSON 404s for unknown API routes,
  static serving of `apps/web/dist` with SPA fallback; `src/index.ts` reads `PORT` and
  `DATABASE_PATH` and opens the SQLite database in WAL mode. Bundled with esbuild.
- `apps/web`: Vite + React + Tailwind v4 + shadcn/ui (Card, Badge); the home page calls
  `/api/health` through the typed client in `src/api/client.ts`. Vite proxies `/api` to port 8080.
- Multi-stage `Dockerfile` and `compose.yaml` (named volume `finance_data` at `/data`,
  `./backups` mounted at `/backups`, health check).
- `CLAUDE.md`, `README.md`, this file, `docs/DECISIONS.md`; `.gitignore` covers `data/`,
  `backups/`, `*.sqlite`, `Statement Samples/`.
- GitHub Actions workflow running `pnpm check:all` on pull requests.

### Verified

- `pnpm check:all` passes: 27 Vitest tests across the four packages, 4 Playwright tests.
- `pnpm dev`: the page loads on port 5173, `/api/health` is proxied, and an edit to the home page
  updated the open browser without a full reload (checked with a headless browser).
- `docker compose up -d --build` serves the same page on port 8080 (the Playwright specs pass
  against it with `E2E_BASE_URL`), the container reports healthy, and the database is created in
  the `finance_data` volume. `docker compose down` stops it and the volume is kept.

### Deviations

- TypeScript 6.0 instead of the latest 7.0, because typescript-eslint does not support 7 yet.
- TanStack Query not installed yet; it arrives with the first data screens (M3).
- `pnpm seed:demo` is not defined yet; it is an M1 task.
- Details and the full dependency list are in DECISIONS.md.

### Follow-ups

- M1 adds the Drizzle schema, migrations, and seed on top of `src/db/connection.ts`.
- The GitHub Actions workflow passed on its first run (PR #1, 5m31s).

## M1: Contracts, schema, seed, fixtures (2026-11-18, branch `m1-contracts`)

### Built

- `packages/shared`: Zod schemas and types for all seven entities (`entities.ts`), `CsvMapping`
  and the preset ids (`csv-mapping.ts`), shared primitives (`primitives.ts`: ids, cents,
  calendar-checked `YYYY-MM-DD` dates, months, timestamps), and a request and response schema
  for every route in PLAN.md section 2 (`api.ts`), including the legacy import and budgets.
- `apps/server/src/db/schema.ts`: Drizzle schema for the seven tables with every PLAN.md index,
  CHECK constraints on enum columns, and foreign keys. First migration
  `migrations/0000_init.sql` generated with drizzle-kit.
- Server start (`db/init.ts`) opens the file, applies pending migrations and seeds an empty
  database: owners Colin, Emily, Joint; the 26 sheet categories in 14 major categories plus Card
  Payment and Transfer (`transfer`); the five accounts with preset mappings and default owners
  (Walmart with an empty `ownerHintMap`); the three card-payment rules. The server build copies
  the migrations to `dist/migrations`.
- `packages/core/src/csv/presets.ts`: the five presets from PLAN.md, needed by the seed.
- `pnpm seed:demo` (`db/demo-seed.ts`): 14 months (2025-09 to 2026-10) across the 5 accounts,
  70 imports and 637 transactions, 80% categorized, card payments set by the seeded rules, and
  every category kind represented. Seeded PRNG and fixed clock.
- `fixtures/generate.ts` (seeded) and its output in `fixtures/csv`: the eight files of PLAN.md
  section 6 with the exact headers, the example rows, the row counts and every "must contain"
  item. `pnpm fixtures:generate` rewrites them.
- `apps/web/src/api`: `http.ts` (fetch wrapper, error mapping, response validation in
  development) and `client.ts` (one typed function per route).

### Acceptance

- Drizzle columns match the Zod entity schemas: `apps/server/src/db/schema.test.ts` (field names,
  nullability, snake_case column names, and a compile-time equality of the row types).
- Empty path is created and seeded, and a second start changes nothing:
  `apps/server/src/db/init.test.ts`. Also checked by hand against the built server.
- `pnpm seed:demo` is deterministic: `apps/server/src/db/demo-seed.test.ts` (identical counts,
  totals and full table contents across two runs).
- Fixtures match the PLAN.md header rows byte for byte: `fixtures/fixtures.test.ts` (also checks
  the files equal the generator's output, the example rows, row counts and contents).
- `pnpm check:all` passes: 132 Vitest tests, 4 Playwright tests.

### Deviations

- Presets were written in M1 rather than M2, because the seed needs them. M2 owns the file.
- The demo seed computes `merchant_key` by hand (M2 writes `merchantKey`); its `dedup_key`
  follows the PLAN.md formula.
- The contract fills in details PLAN.md left open (list shapes, preview and commit shapes,
  `categorySource` on a patch, report row shapes). All are listed in DECISIONS.md under M1.
- Coverage now counts only `.ts`/`.tsx` files, so the SQL migration is not parsed as code.

### Follow-ups

- H1: read the seeded categories and owners (`apps/server/src/db/seed-data.ts`) and compare each
  fixture header with the real file's header, including line endings (fixtures use LF).
- No `GET /session` route is in the plan; M3 may need one to learn the active profile if the
  cookie is HTTP-only. That would be a contract change.
- M2 should produce golden files in `fixtures/expected` from these fixtures.

## M2: CSV engine (2026-11-20, branch `m2-csv-engine`)

### Built

- `packages/core/src/csv`, pure, no I/O:
  - `parse-csv.ts`: `parseCsv(content, mapping, ownerDefaults)` returns one `ParsedRow` per data
    row, `parsed` (normalized fields, `merchantKey`, `dedupKey`, owner) or `skipped` / `error`
    with a reason, each with its line number and raw row. Handles BOM, encodings, trimmed headers,
    description joining, sign normalization, outflow/inflow columns, bank-category regex, owner
    hints, account filter, `skipWhen`, zero-amount skips, and malformed CSV without throwing.
  - `amount.ts` (`parseAmountCents`), `date.ts` (`parseCsvDate`), `decode.ts`, `sha256.ts`,
    `dedup.ts` (`dedupKey`), `merchant.ts` (`merchantKey`), `occurrences.ts`
    (`assignOccurrences`, the n − m rule).
  - The five presets were already correct against the fixtures; unchanged.
- `fixtures/expected`: one golden JSON per fixture and `csv-engine.test.ts`.

### Acceptance

- Golden tests, each fixture parses to its committed JSON: `fixtures/expected/csv-engine.test.ts`
  ("golden files").
- Amount tests for `$1,200.00`, `-$1,200.00`, `(45.10)`, `0.01`, empty, non-numeric:
  `packages/core/src/csv/amount.test.ts`.
- Walmart external ids without quotes, two cardholders to two owners: `csv-engine.test.ts`
  ("Walmart Mastercard").
- Tangerine chequing skips its zero-amount marker rows as `skipped`: `csv-engine.test.ts`
  ("Tangerine chequing").
- Malformed fixture gives `error` rows with reasons (bad date, non-numeric amount, short row) and a
  skipped blank line, without throwing; a file matching no preset errors on every row:
  `csv-engine.test.ts` ("malformed input"), plus `parse-csv.test.ts` for bad quoting and missing
  columns.
- Occurrences: same file twice gives 0 new; the overlapping pair gives 24 new (25 new rows less one
  zero-amount marker) and 10 duplicates; four identical rows against two existing give two new:
  `csv-engine.test.ts` ("occurrences") and `occurrences.test.ts`.
- `packages/core` line coverage 98.95% (threshold 90%).
- `pnpm check:all` passes: 266 Vitest tests, 4 Playwright tests.

### Deviations

- `parseCsv` takes a `Uint8Array` (a `Buffer` is one) instead of `Buffer`, and SHA-256 and text
  decoding are hand-written, to keep core free of Node APIs. Details in DECISIONS.md under M2.
- Golden tests live in `fixtures/expected` (Node types available there) rather than in core.

### Follow-ups

- M4: map `AssignedRow` to `previewRowSchema` (same field names); `existingCountsByKey` is the
  count of the account's transactions per `dedup_key`. File-level problems (missing columns)
  arrive as the same reason on every row; the preview may want to show it once.
- M3/M4: the RBC preset has no `accountFilterValue`, so a file holding two RBC accounts imports
  both until the account form sets one.
- M7/H2: RBC descriptions start with a transaction type ("CONTACTLESS INTERAC PURCHASE TIM
  HORTONS"), so their merchant keys hold no merchant name. PLAN.md's prefix list has only
  Tangerine and card-processor prefixes; extend it once a real RBC export is seen.
