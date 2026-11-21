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
  parsing on the next line, so no row disappears silently. Line numbers come from csv-parse's byte
  position (`context.bytes`, UTF-8 bytes) mapped to line starts, not from its line count, which
  counts a CRLF inside a quoted cell as two lines.
- **File-level problems become row errors.** Mapped columns missing from the header, or an invalid
  user regex (`bankCategoryRegex`, `skipWhen.matches`), are reported as the reason on every row;
  `parseCsv` never throws on input. A completely blank line is a `skipped` row ("Blank line").
- **Row width.** A row with a different number of fields from the header is an `error`.
- **Dates.** Day and month may have one or two digits in every slash format (a file re-saved by a
  spreadsheet drops the zeros); the year needs four digits; impossible dates are errors.
- **Amounts.** Accepts a sign before or after `$`, parentheses, at most two decimals; more decimals
  are an error rather than rounded. A comma is accepted only as a thousands separator in groups of
  three (`1,234.56`); a decimal comma (`12,34`, `45,10 $`) is an error, not $1,234.00. Zero is never `-0`. With `outflow`/`inflow`, amount =
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

## 2026-11-20 · M3

No contract change: `packages/shared` and `db/schema.ts` are untouched.

### Dependencies

| Package                                          | Where   | Why                                                                                                                                                                                     |
| ------------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `react-router` 8                                 | web     | Routing, in the PLAN.md stack table                                                                                                                                                     |
| `@tanstack/react-query` 5                        | web     | Server state, in the PLAN.md stack table (deferred from M0)                                                                                                                             |
| `lucide-react`                                   | web     | Icons; the icon library shadcn/ui is configured with (`components.json`)                                                                                                                |
| `@testing-library/user-event`                    | web dev | Realistic typing and selecting in component tests                                                                                                                                       |
| shadcn/ui `button`, `input`, `label`, `checkbox` | web     | Added with the shadcn CLI. The CLI wrote `import { cn } from "cn"` and installed an unrelated npm package named `cn`; the imports were changed to `@/lib/utils` and the package removed |

`@hono/zod-validator` (in the stack table) was **not** added: its default failure response is not
the documented error shape. `apps/server/src/http.ts` has three small helpers (`parseJsonBody`,
`parseParams`, `parseQuery`) that validate with the shared schemas and throw `HttpError`, which
the app's error handler renders as `{ error: { code, message, details } }`.

### How the web app learns the active profile

PLAN.md has POST and DELETE `/session` but no GET. Rather than add a route (a contract change),
the `profile` cookie is **not HttpOnly**: the web app reads it (`apps/web/src/api/session.ts`)
and matches it against `GET /owners`. The cookie holds only an owner id, which is not a secret
(there are no passwords), so script access exposes nothing. Attributes: `Path=/`,
`SameSite=Lax`, `Max-Age` one year.

### Other M3 choices

- **Only `person` owners are profiles.** POST `/session` with the joint owner's id is 400
  `not_a_profile`; an unknown id is 404. A cookie naming a missing or joint owner counts as no
  profile, and the picker shows.
- **`requireProfile(c, db)`** (`apps/server/src/profile.ts`) returns the active profile or
  throws 401 `no_profile`, for routes that record who acted (M4's import preview). None of the M3
  routes needs it, so owners, accounts and presets answer without a cookie.
- **`createApp` now needs `db`** (and takes an optional `clock`). `src/test-app.ts`
  `makeTestApp(dir)` gives each test its own migrated, seeded database with a fixed clock.
- **Error codes:** `validation_error` and `invalid_json` (400), `invalid_reference` (400, an
  unknown owner id in `defaultOwnerId` or `ownerHintMap`; `details` lists the ids), `not_found`
  (404), `conflict` (409, a duplicate owner or account name), `no_profile` (401).
- **POST `/accounts` answers 201.** `GET /accounts` lists archived accounts too, active first
  then by name; archiving is PATCH `{ archived: true }`.
- **Native `<select>`** (`components/native-select.tsx`) instead of the shadcn Select, for phone
  pickers and simple keyboard and Playwright use.
- **Account form.** The draft model (`pages/settings/account-draft.ts`) converts the form to a
  `CreateAccountRequest`; empty optional fields are omitted, and a mapping with an owner-hint
  column always gets an `ownerHintMap` (empty if no names), so every preset round-trips unchanged.
  An empty `notEquals` or `matches` in a skip rule means "not set". Choosing a preset on an
  existing account replaces its mapping, institution and type.
- **Placeholders.** Pages of later milestones render a placeholder naming the milestone; their
  routes and navigation entries already exist in the append-only lists `apps/web/src/routes.tsx`
  and `apps/web/src/components/nav-items.ts`.
- **The health badge** moved from the M0 home page to `components/server-status.tsx`, shown on
  the profile picker; its tests moved with it.

## 2026-11-20 · M4

No contract change: `packages/shared` and `db/schema.ts` are untouched.

### Dependencies

| Package                       | Where | Why                                                                                                                                                                                                                                             |
| ----------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@funance/core` (workspace)   | web   | `formatCents` for amounts in the import preview, so money is formatted in one place                                                                                                                                                             |
| `@funance/core/money` subpath | core  | New `exports` entry. The core root pulls in csv-parse, which uses Node's `Buffer` and crashed the browser bundle; the web app imports `@funance/core/money` only, and ESLint (`no-restricted-imports`) forbids the root import under `apps/web` |

### How the import flow works

- **A preview stores only the file.** `imports.raw_csv` holds the decoded text (BOM stripped),
  and the counts are written at preview. Commit parses `raw_csv` again with the account's
  current mapping (as UTF-8, since it is already decoded) and compares it with the account's
  transactions as they are at that moment, inside one database transaction. A stale preview
  therefore never inserts rows another import committed in the meantime; its final counts
  can differ from the preview's. If the mapping is edited between preview and commit, the
  commit uses the new mapping.
- **Occurrence numbers fill gaps.** `assignOccurrences` (core) decides new or duplicate from the
  per-key count m, as PLAN.md says. A new row then takes the lowest occurrence its key has
  free: m+1, m+2, ... when there are no gaps, but after undoing an import whose rows were
  occurrence 1 while a later import's occurrence 2 remains, a new row takes 1 instead of
  colliding with the unique `(account_id, dedup_key, occurrence)` index.
- **Missing columns are a 400**, code `missing_columns`, with `details.missingColumns`, checked
  before parsing with the new core helper `missingCsvColumns`. No import row is created. A file
  with no data rows is 400 `empty_file`. Files over 5 MB are 400 `file_too_large`.
- **Other errors:** an unknown account is 404; an archived account is 409 `account_archived`;
  commit of anything but a preview is 409 `not_a_preview`; undo of anything but a committed
  import is 409 `not_committed`; preview without a profile is 401 `no_profile`.
- **POST /imports/preview answers 201** (it creates an import). The commit body is optional: a
  request without a `Content-Type` commits every new row.
- **`skipLines`** is implemented now (ML builds the checkboxes): a listed line that is new at
  commit time is not inserted and is counted as skipped; other listed lines are ignored.
- **`sameFileImportIds`** lists committed imports with the same SHA-256, in any account.
  **`legacyOverlapMonths`** is computed (months of the file's parsed dates that hold rows with no
  account); ML adds the note to the page.
- **Rule engine hook.** `services/rule-engine.ts` defines `RuleEngine`, called with the new rows
  at preview (to show the category a rule would set) and at commit (rows get
  `category_source = rule`, `rule_id`, and the rule's owner if it sets one). `createApp` takes
  it as the `ruleEngine` option, defaulting to `noopRuleEngine`; M6 passes the real one.
- **Stale previews** (status `preview`, `created_at` more than 24 hours before now) are deleted
  by `deleteStalePreviews`, called from `src/index.ts` at start.
- **No backup at commit yet.** PLAN.md section 3 says commit takes a backup; the backup service
  is M10's task, which should call it after `commitImport`.
- **`GET /imports` includes previews**; the history page hides them.

### Web

- Routes: `/import` (form, then preview), `/import/:id` (result), `/import/history`.
- The preview is a table at 768 px and wider, and a list of cards below that.
- Undo asks for confirmation inline (an `alertdialog` region in the row) rather than in a modal,
  so no dialog component was added; it fetches `GET /imports/:id` for the manual count first.
- Commit and undo invalidate every cached query, since they change transactions that lists,
  reports and counts all read.
- Category names in the preview come from `GET /categories` (M6), requested only when a row has a
  rule category, so nothing calls that route until M6 lands.

## 2026-11-21 · M5

No contract change and no new dependency.

### API

- **`GET /categories` arrives in M5, read-only.** The Transactions page needs the category list
  for its filter and pickers, and M6 (which owns categories) depends on M5. M5 adds
  `routes/categories.ts` and `services/categories.ts` with the list only, in `sortOrder` then id
  order, archived categories included; M6 adds create, edit and archive to the same files.
- **`minCents` and `maxCents` compare the signed amount**, inclusive, as stored: spending is
  negative, so `minCents=-10000&maxCents=-2000` finds purchases of $20 to $100. The page labels
  the fields "Min amount" and "Max amount" in signed dollars.
- **Search** (`q`) matches description, memo and notes as a substring with `instr`, so `%` and `_`
  are plain characters. Case folding is SQLite's `lower`, which folds ASCII letters only.
- **Sort ties** fall back to the id in the same direction, so pages never overlap or skip rows.
  `description` sorts with `collate nocase`.
- **Category edits.** Setting a `categoryId` records `categorySource` (`manual` unless the client
  sends `suggestion`) and clears `ruleId`; setting it to null clears both. A `categorySource`
  without a non-null `categoryId` is 400. An unknown owner or category is 400
  `invalid_reference`. An archived category is 400 `archived_category` unless every target row
  already has it, matching "archived categories cannot be newly assigned".
- **Unchanged rows keep their `updatedAt`**: a patch that changes nothing on a row does not touch
  it. Bulk returns `changed` = rows whose values actually changed; repeated ids count once.
- **Bulk is all or nothing**: any missing id is 404 with the missing ids in `details`, and no row
  changes.
- **`suggestedCategoryId`** is not returned yet; M7 adds it to `category=none` lists.
- Transaction edits do not need a profile: nothing records who edited.

### Web

- **TanStack Table was not added.** Sorting and paging happen on the server, so the table is a
  plain `<table>` with sortable header buttons (`aria-sort`); nothing a table library would do is
  left on the client.
- **The whole query lives in the URL**, with API defaults left out (`/transactions?q=uber&sort=amount`).
  Invalid values in a URL are dropped rather than reported. Any change but the page goes back to
  page 1. The selection belongs to one URL and clears when it changes.
- **Filters**: selects and dates apply at once; search and the amount range apply together on
  Enter or Apply. On phones, where the table headers are hidden, a Sort select replaces them.
- **Inline edits are optimistic**: the cached lists show the change at once, roll back on error,
  and every query refetches when the request settles (edits change lists, counts and, later,
  reports).
- Bulk actions: set owner, set category (or Uncategorized), exclude, include. Notes are editable
  through the API but have no editor on the page yet.

## 2026-11-21 · ML

### Contract note: a legacy import stores its workbook

`imports.raw_csv` of a legacy import holds the uploaded `.xlsx` **base64-encoded**, not an empty
string as the M1 note said. Commit must re-read the workbook (as a CSV commit re-reads its file),
and PLAN.md says `raw_csv` is "kept for audit and re-parsing". The column stays `text` and the
Zod type stays `z.string()`, so no migration and no shape change: only the doc comment on
`importSchema.rawCsv` in `packages/shared/src/entities.ts` changes (separate first commit). The
real workbook is about 50 kB, so about 70 kB of text.

### Dependencies

| Package         | Where    | Why                                                                                                         |
| --------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| `exceljs` 4.4.0 | core     | Reads the legacy workbook, as PLAN.md milestone ML specifies. Loaded from bytes only: no filesystem in core |
| `exceljs` 4.4.0 | root dev | `fixtures/legacy/generate.ts` writes the synthetic workbooks; tests import it                               |

exceljs is bundled into the server by esbuild (the server bundle is now 3.3 MB).
The web app never imports it (the `@funance/core` root import is already forbidden there).

### How the legacy importer works

- **`parseLegacyWorkbook(bytes, categories, owners)`** (`packages/core/src/legacy`) is async
  (exceljs loads asynchronously) and never throws on input. It returns `rows` (one per transaction
  row: `parsed`, the `ParsedOkRow` shape plus `sheet`, `categoryId` and `occurrence`, or `error`
  with every message joined), `violations` (one per broken rule) and `monthTotals`.
- **Rule ids** (`LEGACY_RULES`): `file-format`, `no-month-sheets`, `sheet-name`, `hidden-sheet`,
  `header`, `blank-row`, `merged-cells`, `formula`, `required`, `date-type`, `date-month`,
  `date-time`, `description-type`, `description-length`, `description-line-break`,
  `description-spaces`, `amount-type`, `amount-zero`, `amount-decimals`, `category-name`,
  `owner-name`, `income-sign`. "Each month at most once" needs no rule: Excel forbids two sheets
  with the same name, and `MM-YYYY` gives each month exactly one name.
- **One problem, one violation.** A formula or empty cell is reported once (`formula` or
  `required`) and its other checks are skipped; a row with a merged cell in A to E is one
  `merged-cells` violation and is not checked further. Checks within a column stop at the first
  failure, so a planted violation never produces a second one.
- **Amounts** are converted from the cell's number through its shortest decimal text
  (`String(54.46)`), so `54.463` is an `amount-decimals` violation and no floating-point maths is
  done on money.
- **Dates** are the cell's Excel date read in UTC (exceljs's convention); any time of day is a
  violation.
- **Descriptions** may be plain or rich text; inner runs of whitespace are collapsed, as CSV
  descriptions are.
- **Blank rows**: a row is blank when A to E are all empty. Blank rows after the last transaction
  are allowed (column F may still hold formulas there); a blank row before it is a violation.
- **Allowed names** are the active categories whose kind is not `transfer` (the sheet never had
  Card Payment or Transfer) and every owner, both matched exactly. `income-sign` applies to any
  `income`-kind category.
- **Month totals** count every transaction row of a month sheet and sum the amounts that could be
  read, as the sheet records them (spending positive), so they can be compared with the sheet
  even while some rows have problems.
- **`line`** of a legacy preview row is its sheet row; the sheet is in `raw.sheet`, and the web
  app labels rows "07-2026 row 5". Identical rows get occurrences 1, 2, ... within the workbook.

### API

- `POST /imports/legacy/preview` needs a profile (401) and a file named `.xlsx` (400 `not_xlsx`,
  which also covers `.xls`, `.xlsm` and `.csv`). Violations do not fail the request: it answers
  201 with them listed, and an unreadable file is a `file-format` violation. 409
  `legacy_already_committed` while a legacy import is committed.
- `POST /imports/:id/commit` looks up the import's kind and sends a legacy import to
  `commitLegacyImport`, which parses the stored workbook again with the categories and owners as
  they are then. 409 `legacy_has_errors` while it has violations, 409 `legacy_already_committed`
  when another legacy import is committed, 409 `not_a_preview` as for CSV. A non-empty
  `skipLines` is 400 `skip_lines_not_supported`: legacy rows are fixed in the workbook, not
  unticked.
- Legacy rows get `account_id` null, `category_source = manual`, no rule, no posted date, memo,
  bank category or external id; `dedup_key` follows the PLAN.md formula. Undo is unchanged.

### CSV preview

- Every `new` row has an include checkbox, ticked by default; unticked lines go to commit as
  `skipLines`, and the Commit button counts only the ticked rows.
- When `legacyOverlapMonths` is not empty, a note names the months and asks the uploader to
  untick rows the spreadsheet already recorded. No matching is done.

### Not built here (depends on unbuilt milestones)

- "Reports include legacy rows under every owner filter": the reports are M8's.
- `account=none` on `GET /transactions` and "None" in the transaction list and its account
  filter came with M5, merged before ML. After merging main, the Playwright journey opens
  **Transactions** with **Account: None** and finds the legacy rows there.
