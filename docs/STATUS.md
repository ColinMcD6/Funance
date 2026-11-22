# Status

Milestone log. Every session appends an entry: what was built, deviations, follow-ups.
Plan: [PLAN.md](PLAN.md). Deviations and new dependencies: [DECISIONS.md](DECISIONS.md).

| Milestone                            | State             |
| ------------------------------------ | ----------------- |
| M0 Scaffold and tooling              | Done              |
| M1 Contracts, schema, seed, fixtures | Done, awaiting H1 |
| M2 CSV engine                        | Done              |
| M3 App shell, profiles, accounts     | Done              |
| M4 Import flow                       | Done, awaiting H2 |
| M5 Transaction list and editing      | Done              |
| ML Legacy spreadsheet import         | Done, awaiting H2 |
| M6 Categories and rules              | Done              |
| M7 Uncategorized queue               | Not started       |
| M8 Reports and dashboard             | Done, awaiting H3 |
| M9 Budgets                           | Done              |
| M10                                  | Not started       |

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
- `pnpm check:all` passes: 280 Vitest tests, 4 Playwright tests.

### Review fixes

- Line numbers drifted by one per CRLF inside a quoted cell (csv-parse's `lines` counts it twice),
  and a malformed record after one made the parser restart a line late, dropping a valid row
  silently. Line numbers now come from byte positions. Tests: `parse-csv.test.ts` ("counts a CRLF
  inside a quoted cell as one line", "loses no row after bad quoting...", "numbers lines
  correctly after multi-byte UTF-8 text").
- `parseAmountCents` removed every comma, so a decimal comma (`12,34`) read as $1,234.00. Commas
  are now accepted only as thousands separators; anything else is an error. Tests:
  `amount.test.ts`.

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

## M3: App shell, profiles, accounts (2026-11-20, branch `m3-app-shell`)

### Built

- Server routes, one file each in `apps/server/src/routes`, with SQL in `services/owners.ts` and
  `services/accounts.ts`:
  - `GET /owners`, `PATCH /owners/:id` (rename; 409 on a name another owner has).
  - `POST /session` (sets the `profile` cookie for a person; joint is 400, unknown is 404),
    `DELETE /session`.
  - `GET /accounts`, `POST /accounts`, `PATCH /accounts/:id` (edit, archive, restore); owner ids
    in `defaultOwnerId` and `ownerHintMap` are checked; duplicate names are 409.
  - `GET /csv-presets` (the five presets from core).
  - `http.ts` request validation helpers and `HttpError`; `profile.ts` `requireProfile` for M4.
- Web (`apps/web/src`): React Router and TanStack Query (`api/queries.ts`).
  - `ProfileGate` shows the profile picker until the cookie names a person; the header's
    profile switcher changes profile or returns to the picker.
  - `AppShell`: sidebar on desktop, fixed bottom bar with icons and short labels below 768 px.
    Navigation and routes are the append-only lists `components/nav-items.ts` and `routes.tsx`;
    pages of later milestones are placeholders.
  - Settings: rename owners; list accounts with Edit and Archive/Restore; the account form
    (new and edit) picks a preset, then shows every mapping field as editable, including the
    owner-hint value map and the skip rules.

### Acceptance

- API tests cover each route's success and validation-failure cases:
  `apps/server/src/routes/owners.test.ts`, `session.test.ts`, `accounts.test.ts`,
  `csv-presets.test.ts`.
- Playwright: choose a profile, create an account from the `walmart-mastercard` preset, map two
  cardholder names to owners, reload, and see it persisted: `e2e/profiles-accounts.spec.ts`
  ("create a Walmart account from the preset with two cardholders, and it persists"), on both the
  desktop and 390 px projects.
- The shell is usable at 390 px with no horizontal scrolling: `e2e/profiles-accounts.spec.ts`
  ("the shell has no horizontal scrolling on any page", "every page is reachable from the
  visible navigation"), phone project.
- Component tests: `app.test.tsx` (gate, switcher, navigation), `pages/settings/settings.test.tsx`,
  `pages/settings/account-draft.test.ts`, `components/server-status.test.tsx`,
  `api/session.test.ts`.
- `pnpm check:all` passes: 337 Vitest tests, 12 Playwright tests.

### Deviations

- No contract change. The web app reads the (non-HttpOnly) profile cookie instead of a
  `GET /session` route; see DECISIONS.md under M3.
- `@hono/zod-validator` was not added; small helpers in `http.ts` keep the documented error shape.
- `createApp` now takes the database; `app.test.ts` builds its app through `makeTestApp`.
- The M0 home page was removed; its health badge and tests moved to `components/server-status`.

### Follow-ups

- The web bundle is 526 kB (Vite warns above 500 kB). Splitting pages with lazy routes can wait
  until the chart pages (M8) make it bigger.
- M4: call `requireProfile` in `POST /imports/preview`; hide archived accounts from the import
  account picker.
- M5 to M8: replace the placeholder entries in `routes.tsx` (one line each).

## M4: Import flow (2026-11-20, branch `m4-import`)

### Built

- `apps/server/src/services/imports.ts` and `routes/imports.ts`:
  - `POST /imports/preview` (multipart `file` + `accountId`, needs a profile): parses with the
    account's mapping, compares with the account's transactions, stores an import in `preview`
    with its counts, and returns every row with status, reason, owner and rule category, plus
    the identical-file warning (`sameFileImportIds`) and `legacyOverlapMonths`.
  - `POST /imports/:id/commit`: in one database transaction, re-reads the stored file, inserts
    the rows still new at that moment (less `skipLines`), applies the rule engine, records the
    final counts. 409 unless the import is a preview.
  - `POST /imports/:id/undo`: deletes the import's transactions, marks it undone. 409 unless
    committed.
  - `GET /imports` (newest first) and `GET /imports/:id` (with `manuallyCategorizedCount`).
  - `deleteStalePreviews` runs at server start and removes previews older than 24 hours.
- `services/rule-engine.ts`: the `RuleEngine` interface and `noopRuleEngine`, the default of the
  new `createApp` option `ruleEngine`.
- `packages/core`: `missingCsvColumns(content, mapping)` for the clear 400; a `./money` subpath
  export so the browser can import `formatCents` without the CSV engine.
- Web (`apps/web/src/pages/import`): the Import page (active accounts only, file, preview with
  counts, identical-file warning, status filter, table on desktop and cards on phones, Commit
  and Cancel; a missing-columns error links to the account's mapping), the result screen
  `/import/:id` linking to Uncategorized, and Import history `/import/history` with an inline
  undo confirmation that states how many hand-categorized rows will be lost.

### Acceptance

- Preview then commit inserts the expected rows: `apps/server/src/routes/imports.test.ts`
  ("inserts the new rows with their parsed fields and records the final counts").
- A second preview of the same file shows all duplicates and the identical-file warning:
  `imports.test.ts` ("a second preview of the same file shows every row as a duplicate and the
  same-file warning").
- The overlapping fixture inserts only the new rows (24 of 35): `imports.test.ts` ("inserts only
  the new rows of an overlapping statement").
- Undo removes exactly that import's rows: `imports.test.ts` ("removes exactly that import’s rows
  and marks it undone").
- Committing twice returns 409: `imports.test.ts` ("answers 409 when the import is already
  committed...").
- A file whose headers do not match the mapping returns 400 naming the missing columns:
  `imports.test.ts` ("answers 400 naming the missing columns...") and
  `packages/core/src/csv/parse-csv.test.ts` (`missingCsvColumns`); shown on the page with a link
  to the mapping in `e2e/import.spec.ts` and `pages/import/import.test.tsx`.
- Playwright: import a fixture, see the counts, commit, find the rows in the database through
  the API, undo, and see them gone: `e2e/import.spec.ts` ("import a statement, commit, find its
  rows, undo, and see them gone"), desktop and 390 px.
- Also tested: previews older than 24 hours are deleted; commit decides duplicates at commit time;
  unticked lines are skipped; occurrence gaps after an undo; latin1 files; the rule engine hook;
  401, 404, 409 and validation errors; web component tests in `pages/import/import.test.tsx`.
- `pnpm check:all` passes: 376 Vitest tests, 16 Playwright tests.

### Deviations

- No contract change.
- "Find the rows in the database through the API": `GET /transactions` is M5's and not built
  yet, so the e2e test previews the same file again through the API and expects every row to be
  a duplicate (after commit) or new (after undo). M5 can add a `GET /transactions?account=`
  check to `e2e/import.spec.ts`.
- Commit does not take a backup yet; that is M10's backup service.
- Commit uses the account's mapping at commit time, not at preview time. Details in
  DECISIONS.md under M4.
- Shared files touched beyond the milestone's area: `apps/server/src/app.ts` and
  `apps/web/src/routes.tsx` (append-only lines), `apps/server/src/index.ts` (stale-preview
  cleanup at start), `packages/core` (`missingCsvColumns`, the `./money` export),
  `eslint.config.js` (forbids the core root import in web code).

### Follow-ups

- H2: on the real host, import one real statement per bank, check counts and five random rows,
  re-import to confirm zero new.
- M6: implement `RuleEngine` and pass it to `createApp` in `src/index.ts` (and `makeTestApp` if
  tests need it); seeded card-payment rules then show in the preview.
- ML: the preview's include checkboxes post `skipLines`, already supported by commit; show
  `legacyOverlapMonths` as a note.
- M10: take a backup after `commitImport`.
- The web bundle is 540 kB (Vite warns above 500 kB); lazy routes can wait until M8.

## M5: Transaction list and editing (2026-11-21, branch `m5-transactions`)

### Built

- `apps/server/src/services/transactions.ts` and `routes/transactions.ts`:
  - `GET /transactions` with every filter (`owner`, `account` id or `none`, `category` id or
    `none`, `from`, `to`, `q` over description, memo and notes, `minCents`, `maxCents`,
    `excluded`), every sort (`date`, `amount`, `description`, either order, ties by id) and
    pagination, returning `{ items, total }`.
  - `PATCH /transactions/:id` (owner, category, notes, excluded; a category set here records
    `category_source = manual`, or `suggestion` when asked) and `POST /transactions/bulk`
    (all or nothing, returns how many rows changed).
- `GET /categories` (read-only list, `routes/categories.ts`, `services/categories.ts`); M6 adds
  the rest of the categories routes to these files.
- Web (`apps/web/src/pages/transactions`): the Transactions page with a filter bar (search,
  amount range, owner, account including None, category including Uncategorized, date range,
  included/excluded), sortable column headers (a Sort select on phones), pagination with page
  size, inline owner and category selects, row selection with select-all and bulk actions (set
  owner, set category, exclude, include). Filters, sort and page live in the URL. A table at
  768 px and wider, cards below. Query hooks `useTransactions`, `useUpdateTransaction`,
  `useBulkUpdateTransactions` with optimistic edits.

### Acceptance

- Integration tests for each filter alone (15 cases, including `account=none`,
  `category=none`, search in each of the three fields and case-insensitivity), three
  combinations, each sort in both orders, and pagination boundaries (full first page, partial
  last page, past the last page, page size 1 across ties, page size 500, 400 for 0 and 501):
  `apps/server/src/routes/transactions.test.ts` ("GET /api/transactions filters", "sorting",
  "pagination").
- Setting a category through the API records `category_source = manual`: `transactions.test.ts`
  ("records category_source manual when a category is set, and clears the rule", and the bulk
  test "categorizes several rows by hand and returns how many changed").
- Playwright: search for a merchant, sort by amount, change one row's owner, bulk-categorize three
  rows, reload, and see all changes kept (checked in the page and through the API):
  `e2e/transactions.spec.ts`, desktop and 390 px.
- Also tested: PATCH and bulk validation (404, unknown owner or category, archived category,
  `categorySource` without a category, bad JSON), unchanged rows keep `updatedAt`, totals against
  `seed:demo` data; web component tests in `pages/transactions/transactions.test.tsx` and URL and
  dollar parsing in `transaction-filters.test.ts`.
- M4 follow-up done: `e2e/import.spec.ts` now also counts the account's rows through
  `GET /transactions?account=` after commit (38) and after undo (0).
- `pnpm check:all` passes: 480 Vitest tests, 18 Playwright tests.

### Deviations

- No contract change, no new dependency.
- `GET /categories` was built here (read-only) because the page needs it and M6 comes after M5.
- TanStack Table was not added: sorting and paging are server-side, so a plain table does it.
- Shared files touched beyond the milestone's area: `apps/server/src/app.ts` and
  `apps/web/src/routes.tsx` (append-only lines), `apps/web/src/api/queries.ts` (new hooks),
  `e2e/import.spec.ts` (the M4 follow-up check).
- Details in DECISIONS.md under M5.

### Follow-ups

- M6: add POST, PATCH and DELETE to `routes/categories.ts` and `services/categories.ts`.
- M7: return `suggestedCategoryId` from `listTransactions` when `category=none`; send
  `categorySource: 'suggestion'` when a suggestion is accepted (the API already records it).
- M8: link chart and table clicks to `/transactions?category=…&from=…&to=…&owner=…`.
- M10 mobile pass: on phones the filter bar fills the first screen; consider folding it behind a
  "Filters" button. Notes have no editor on the page yet (the API supports them).

## ML: Legacy spreadsheet import (2026-11-21, branch `ml-legacy-import`)

### Built

- `packages/core/src/legacy/parse-legacy-workbook.ts`: `parseLegacyWorkbook(bytes, categories,
owners)` with exceljs. Enforces every rule of the PLAN.md format specification, returns one
  row per transaction row (the CSV engine's `ParsedOkRow` shape plus sheet, category and
  occurrence, or an `error` row), one violation per broken rule (sheet, row, column, rule,
  message), and per-month row counts and sheet totals. Amounts are sign-flipped into cents.
- `fixtures/legacy/generate.ts` writes `legacy-valid.xlsx` (60 rows over 3 month sheets, a
  Categories sheet, income and a refund as negative amounts, two identical rows, a Major Category
  formula column, empty trailing rows) and `legacy-invalid.xlsx` (20 planted violations, listed
  in `PLANTED_VIOLATIONS`). `pnpm fixtures:generate` now runs it too.
- Server: `services/legacy-imports.ts` and `POST /imports/legacy/preview`; `POST
/imports/:id/commit` sends a legacy import to the legacy commit (409 with violations or while
  another legacy import is committed); undo is unchanged. The workbook is stored base64 in
  `raw_csv` and parsed again at commit.
- Web: Settings section **Legacy spreadsheet** and page `/settings/legacy-import` (upload,
  month totals, the violation list, the rows with their sheet and row, Commit only when clean,
  then the import result). The CSV import preview has an include checkbox on every new row
  (unticked lines are posted as `skipLines`) and a note naming months that hold legacy rows.
  The result page hides "Categorize new transactions" for a legacy import.
- `.gitignore` ignores `*.xlsx` except `fixtures/legacy/*.xlsx`.

### Acceptance

- Golden test, valid fixture to committed JSON with sign-flipped cents:
  `fixtures/expected/legacy-engine.test.ts` ("parses to expected/legacy-valid.json"), golden
  `fixtures/expected/legacy-valid.json`.
- Invalid fixture yields exactly one violation per planted violation, naming sheet, row, column
  and rule: `legacy-engine.test.ts` ("yields exactly one violation per planted violation...",
  "plants a violation of every rule..."). One test per rule:
  `packages/core/src/legacy/parse-legacy-workbook.test.ts` ("one test per rule of the
  specification", 22 tests).
- Commit of the valid fixture inserts rows with null `account_id`, `category_source = manual`
  and the expected per-month totals; undo removes them all; a preview with errors is 409; a second
  legacy commit is 409: `apps/server/src/routes/legacy-imports.test.ts`.
- A CSV commit without an account is rejected with 400: `legacy-imports.test.ts` ("the CSV
  commit service rejects an import without an account with 400"). The database CHECK from M1 also
  forbids a csv import with no account.
- After a legacy commit, a CSV row with the same date, amount and description is still `new` and
  is inserted: `legacy-imports.test.ts` ("a CSV row equal to a legacy row is still new...").
- A CSV row unticked in the preview is not inserted and is counted as skipped: server side
  `imports.test.ts` ("leaves out unticked lines and counts them as skipped", M4); the checkbox
  posting `skipLines` in `apps/web/src/pages/import/import.test.tsx` ("leaves out unticked
  rows...").
- **Not met: "Reports include legacy rows under every owner filter".** The reports are M8's and
  do not exist yet. M8 must add this test.
- Playwright: `e2e/legacy-import.spec.ts` uploads the valid fixture in Settings, commits, sees
  account "None" on the result page, opens **Transactions** filtered by **Account: None** (60
  rows; a search finds the two Tim Hortons rows, each with account "None"), sees "None" in Import
  history, undoes, and checks `GET /transactions?account=none` is empty. The invalid workbook's
  20 problems and the disabled Commit are checked on both projects.
- `pnpm check:all` passes after merging M5: 540 Vitest tests, 21 Playwright tests (1 skipped, see
  below).

### Deviations

- Contract note, no shape change: a legacy import's `raw_csv` holds the workbook as base64
  (the M1 comment said empty). Separate first commit; details in DECISIONS.md under ML.
- `account=none` on `GET /transactions` and the **Account: None** filter come from M5 (merged
  into this branch before the e2e check was added).
- The legacy commit journey runs in the desktop Playwright project only. Both projects share one
  database and only one legacy import can be committed at a time, so running it twice in
  parallel would make one fail with 409.
- A legacy commit with a non-empty `skipLines` is 400: legacy rows are fixed in the workbook.
- Shared files touched beyond the milestone's area: `apps/web/src/routes.tsx` (one line),
  `settings-page.tsx` (one section), `api/queries.ts` (one hook), `routes/imports.ts` (the
  legacy route and the commit dispatch), `services/imports.ts` (exports), the M4 import preview
  components (checkboxes and note, as ML's task says), `package.json` (`fixtures:generate`).

### Follow-ups

- M8: a test that reports include legacy rows under every owner filter (Colin, Emily, Joint, all).
- H2: once the real workbook conforms, expect 13 month sheets, 799 rows, zero violations, and
  compare each month's sheet total with the workbook.
- The web bundle is 548 kB (Vite warns above 500 kB); lazy routes can wait until M8.

## M6: Categories and rules (2026-11-21, branch `m6-categories-rules`)

### Built

- `packages/core/src/rules.ts`: `matchRule(transaction, rules)` and `createRuleMatcher(rules)`
  (first enabled rule by priority, then id; case-insensitive `contains`, `starts_with`,
  `equals`, `regex`; account and direction limits; never throws), `ruleMatches` for one draft,
  and `rulePatternError` for save-time validation.
- Server:
  - `services/rule-engine.ts`: `databaseRuleEngine` (enabled rules whose category is not
    archived) is now the default `ruleEngine` of `createApp`, so import preview shows and commit
    records rule categories, `category_source = rule` and the rule's owner.
  - `routes/rules.ts`, `services/rules.ts`: `GET`, `POST /rules`, `PATCH`, `DELETE /rules/:id`,
    `POST /rules/test` (match count and the ten newest matches of an unsaved rule),
    `POST /rules/apply` (uncategorized and rule-categorized rows only; returns how many changed).
  - `routes/categories.ts`, `services/categories.ts`: `POST /categories`,
    `PATCH /categories/:id` (rename, kind, color, group, order, archive, restore),
    `DELETE /categories/:id[?reassignTo=]` (archive, moving transactions and rules first).
- Web:
  - **Categories** page (`pages/categories`): new category form (name, major category with
    suggestions, kind, color), Edit, up and down reorder, Archive with an optional "Move its
    transactions and rules to" picker, an Archived section with Restore.
  - **Rules** page (`pages/rules`): rules in priority order with their condition, category and
    limits; New rule and Edit forms with a live match preview (count and up to ten samples, the
    server's error for an invalid regex); Enabled checkbox; up and down reorder; Delete with
    confirmation; **Apply rules now** with the number changed.
  - Query hooks in `api/queries.ts`; `lib/reorder.ts` and `lib/use-debounced-value.ts`.

### Acceptance

- Unit tests for every `match_type`, case-insensitivity, the account and direction limits,
  priority order, disabled rules, and an invalid regex never thrown at match time:
  `packages/core/src/rules.test.ts` (27 tests). The invalid regex rejected with 400 at save:
  `apps/server/src/routes/rules.test.ts` ("rejects an invalid regex with 400 at save", and the
  PATCH and `rules/test` cases).
- `rules/apply` never changes a transaction whose `category_source` is `manual`:
  `rules.test.ts` ("never changes a transaction whose category_source is manual", which also
  covers `suggestion`).
- Archiving with `reassignTo` moves its transactions; without it they keep the archived
  category: `apps/server/src/routes/categories.test.ts` ("with reassignTo, moves its
  transactions and rules first", "without reassignTo, archives and the transactions keep the
  archived category").
- Playwright: create "description contains COSTCO sets Groceries", see the preview count (5),
  apply, and see the matching rows categorized (through the API and on the Transactions page):
  `e2e/rules.spec.ts`, desktop and 390 px.
- Import wiring: `rules.test.ts` ("preview shows the category a rule would assign, and commit
  records it", "ignores disabled rules and rules whose category is archived").
- Web component tests: `pages/categories/categories.test.tsx`, `pages/rules/rules.test.tsx`,
  `pages/rules/rule-draft.test.ts`, `lib/reorder.test.ts`.
- `pnpm check:all` passes: 639 Vitest tests, 23 Playwright tests (1 skipped, as before).

### Deviations

- No contract change, no new dependency.
- The real rule engine is the app's default, so one M4 test now expects the seeded card-payment
  rule to categorize the September fixture's card payment (`imports.test.ts`).
- Reordering uses `PATCH` on `sortOrder` and `priority` (two calls per move) instead of a
  reorder route, which the contract does not have.
- `rules/apply` leaves rule-categorized rows that no longer match any rule as they are.
- Shared files touched beyond the milestone's area: `apps/server/src/app.ts` and
  `apps/web/src/routes.tsx` (route lines), `apps/web/src/api/queries.ts` (new hooks),
  `packages/core/src/index.ts` (one export), `apps/server/src/routes/imports.test.ts` (above),
  `apps/server/src/db/test-rows.ts` (a new test helper for inserting transactions).
- Details in DECISIONS.md under M6.

### Follow-ups

- M7: the "Always categorize WAL-MART as Groceries?" prompt can call `POST /rules/test` for the
  count, then `POST /rules` and `POST /rules/apply`; the Rules form's `RulePreview` is reusable.
- M7: `rules/apply` returns only a count; if the prompt needs to say which rows changed, that is a
  contract change.
- M8: reports should treat archived categories like any other (they keep their history).

## M8: Reports and dashboard (2026-11-21, branch `m8-reports`)

Built before M7, which it does not depend on.

### Built

- `packages/core/src/reports.ts` (new export `@funance/core/reports`): month arithmetic
  (`addMonths`, `monthsBetween`, `monthDateRange`), `directedCents` (a sum in its kind's
  direction; transfers null), `averageCents` (rounded half away from zero), `reportTotals`
  (income, spending, saved, left over, and the uncategorized bucket apart) and
  `buildCompareRows` (null for a month with no data, the trailing average over months with data).
- Server: `services/reports.ts` and `routes/reports.ts`. `GET /reports/monthly` is one SQL
  aggregate grouped by month and category (or major category), with conditional sums per kind;
  `GET /reports/compare` aggregates the five months it needs (this month, the three before, the
  same month last year) and assembles rows with `buildCompareRows`. Both leave out excluded rows
  and transfer categories and filter by owner.
- Web (`pages/reports`):
  - **Dashboard** (`/`): month picker (previous, next, month field), owner switch (each owner and
    All, defaulting to the active profile), Categories / Major categories switch; Income,
    Spending, Saved and Left over cards; an uncategorized warning that links to those rows; a
    horizontal spending breakdown chart; and a table with this month, last month, change, last
    year, 3-month average and change against the average, in Spending, Income and Saved sections.
    Every category name and chart bar opens Transactions filtered to that category, month and
    owner (and not excluded).
  - **Trends** (`/trends`, new nav item): stacked monthly spending over 12 or 24 months, and a
    line chart with a checkbox per category (the three largest picked by default). Clicking a bar
    segment opens that category and month in Transactions.
  - View state lives in the URL (`month`, `owner`, `groupBy`, `span`). Recharts is added and loaded
    lazily with the chart components.

### Acceptance

- Report tests against a hand-written dataset with totals worked out in the test file
  (`apps/server/src/routes/reports.test.ts`):
  - a refund reduces its category: "gives each category of a month its own kind total; a refund
    reduces its category";
  - transfers and excluded rows are absent: "leaves transfers and excluded rows out";
  - savings count toward saved, not spending: "counts savings categories toward saved and not
    toward spending";
  - left over equals income minus spending minus saved: "household totals: left over equals
    income minus spending minus saved" (and `reportTotals` in `packages/core/src/reports.test.ts`);
  - uncategorized is its own bucket: "puts uncategorized rows in their own bucket";
  - each owner filter matches a manual sum: "owner %i matches a manual sum" (Colin, Emily, Joint);
  - All equals the sum of the three owners: "All equals the sum of the three owners, row by row".
- Comparison with no prior-year data returns null, not zero: "returns null, not zero, for a month
  with no prior-year data" (also `buildCompareRows` unit tests, and "filters by owner; a month
  with data from another owner is zero, not null").
- Playwright (`e2e/reports.spec.ts`, desktop and 390 px): "monthly review: switch owner, see the
  totals change, drill into a category" switches Colin, Emily, Joint and All and checks each
  set of totals against values written in the spec, then clicks Groceries in the table, and a
  chart bar, and lands on a correctly filtered Transactions list (URL and row count).
- Charts render at 390 px without overflow: the same spec and "trends: charts render and fit the
  screen" check that each chart's SVG lies inside the viewport and the page has no horizontal
  scroll.
- Also: the M5/ML follow-up "reports include legacy rows under every owner filter" ("legacy rows
  count under every owner filter, like statement rows"); web tests in
  `pages/reports/report-view.test.ts` and `pages/reports/reports.test.tsx`.
- `pnpm check:all` passes: 718 Vitest tests, 27 Playwright tests (1 skipped, as before).

### Review fixes

- Trends by major category dropped the spending of a mixed group whose first category is not an
  expense: `spendingTrend` filtered on the group's kind, which is its first category's, so Money
  (Investing first in the seed) lost its Debt Payments. `spendingCents` already holds only
  expense and uncategorized amounts, so the kind filter is gone. Test:
  `report-view.test.ts` ("keeps the spending of a mixed major category whose first category is
  not an expense").

### Deviations

- No contract change. New dependency `recharts` (DECISIONS.md, M8).
- Choices where the contract left room are recorded in DECISIONS.md under M8: the uncategorized
  bucket's amount is in `spendingCents` but outside the spending total; "a month with no data"
  means no transaction at all in the database for that month; the trailing average divides by
  the months that have data.
- In Major categories mode, rows and bars are not links: Transactions cannot filter by major
  category without a contract change.
- The owner switch shows owner names (Colin, Emily, Joint, All) rather than "Me / Wife".
- The Playwright data is a hand-written CSV imported into the spec's own account in 2016 to 2019,
  so it is independent of other specs that share the e2e database; `pnpm seed:demo` is not used.
- Shared files touched beyond the milestone's area: `apps/server/src/app.ts` (route line),
  `apps/web/src/routes.tsx` (Dashboard replaces its placeholder; Trends route),
  `components/nav-items.ts` (Trends), `components/app-shell.tsx` (bottom bar column count),
  `app.test.tsx` (the nav list now includes Trends), `api/queries.ts` (two hooks),
  `packages/core/src/index.ts` and `package.json` (exports).

### Follow-ups

- H3: categorize one real month and check two category totals against a manual sum.
- A `group` filter on `GET /transactions` would let major-category rows drill down (contract
  change).
- M9: budget indicators can go in `CompareTable` as one more column.
- M10: the phone bottom bar now has 8 items; review it in the responsive pass. The main bundle is
  603 kB (warning above 500 kB, as before M8).
- The M8 PLAN.md review step (a second agent session reviewing the report maths) is for you to
  start.

## M9: Budgets (2026-11-22, branch `m9-budgets`)

### Built

- `packages/core/src/budgets.ts` (new export `@funance/core/budgets`): `effectiveBudget` (latest
  row at or before a month, per category and owner), `budgetForView` (one owner: their own budget;
  All: the household budget, else the sum of the owners' budgets), `budgetStatus` (actual minus
  budget, percent used) and `duplicateBudget`.
- Server: `services/budgets.ts` and `routes/budgets.ts`. `GET /budgets` lists every row;
  `PUT /budgets` replaces them all in one transaction, after checking categories, owners, no
  transfer category and no duplicate category, owner and month (400 otherwise, nothing changed).
- Web:
  - **Settings → Budgets** (`pages/budgets`, route `/settings/budgets`, linked from a new Budgets
    section on Settings): edit every row as a draft (category, Household or an owner, from month,
    monthly amount), add and remove rows, save with one PUT or discard. Rows in effect this month
    are marked. Problems (missing or negative amount, duplicate) point at their row.
  - **Dashboard:** each row of the comparison table with a budget shows a bar and the signed
    amount against it under the category name, e.g. `+$20.00 over of $100.00` or
    `-$20.00 under of $50.00`. The budget follows the owner switch and the month. In major-category
    mode a group adds up its categories' budgets within the section.
- `pnpm seed:demo` writes five demo budgets.

### Acceptance

- Effective-from lookup: `packages/core/src/budgets.test.ts` ("effectiveBudget": before the first
  row, from a row's own month, the latest row until a later one, across a year boundary) and, on
  rows stored through the API, `apps/server/src/routes/budgets.test.ts` ("applies the latest row
  at or before a month, per owner and for the household").
- Household versus per-owner budgets: `budgets.test.ts` in core ("budgetForView": one owner uses
  only their own; All uses the household budget, else the sum of the owners'; falls back to owners
  before a household row starts), the same server test, and `pages/reports/budget-view.test.ts`.
- The indicator shows the correct sign and amount for seeded data:
  - Playwright `e2e/budgets.spec.ts` seeds a month through the API (own category, account and year)
    and checks `+$10.00 over of $150.00` (All, household budget from the 2014-03 row, not the
    2014-01 or 2015-04 ones), `+$20.00 over of $100.00` (Colin), `-$20.00 under of $50.00` (Emily),
    none for Joint; then adds a Joint budget in Settings → Budgets and sees `-$5.00 under of $15.00`;
    April shows the $1 household row; and at 390 px the indicator shows with no horizontal scroll.
  - Component tests in `pages/reports/reports.test.tsx` ("Dashboard budgets": over, under, owner
    switch, none before the budget starts, colours).
- Also: API validation tests in `routes/budgets.test.ts`; Budgets page tests in
  `pages/budgets/budgets.test.tsx` and `budget-draft.test.ts`; the demo seed test counts budgets.
- `pnpm check:all` passes: 771 Vitest tests, 28 Playwright tests (2 skipped: the legacy commit
  journey and the budgets spec each run in the desktop project only).

### Deviations

- No contract change, no new dependency. Choices are in DECISIONS.md under M9.
- The indicator sits under the category name, not in a new column as the M8 follow-up suggested,
  so it fits a phone.
- Two test fixes outside the milestone's area, neither changing an assertion:
  `e2e/legacy-import.spec.ts` (the invalid-workbook test retries its preview while the other
  legacy test holds a committed import; a race that was already there, which the new spec's
  worker schedule exposed) and `pages/reports/reports.test.tsx` (preloads the lazy chart modules,
  whose first import could pass the 5 s timeout under the full suite).
- Shared files touched: `apps/server/src/app.ts` (route line), `apps/web/src/routes.tsx` (route),
  `api/queries.ts` (two hooks), `pages/settings/settings-page.tsx` (section),
  `pages/reports/compare-table.tsx` and `dashboard-page.tsx` (indicator),
  `packages/core/src/index.ts` and `package.json` (exports), `db/demo-seed*.ts` (demo budgets).

### Follow-ups

- A budgeted category with no transactions in the month or the comparison months has no table row,
  so its unspent budget is not shown.
- The budgets page saves every row with one PUT; two people saving at once would overwrite each
  other (last save wins). That is acceptable for one household; a per-row API would be a contract
  change.
