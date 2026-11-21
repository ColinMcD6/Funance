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
| M6 to M10                            | Not started       |

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
