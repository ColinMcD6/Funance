# Household Finance Tracker: Implementation Plan

Nov 12, 2026 · @Colin McDonell

## Decisions at a glance

The app is a single TypeScript web app with a SQLite database, started with `docker compose up -d` and reached from any browser on the home network. It is built in 12 small milestones (M0 to M10, plus ML for the legacy spreadsheet), each sized for one agent session, with 4 human checkpoints.

| Topic | Decision | Source |
| --- | --- | --- |
| Scope | Spending and income; card payments and account-to-account transfers are imported but excluded from totals | Your answer |
| Splits | None in v1: one category and one owner per transaction | Your answer |
| Sign-in | Profile picker, no password | Your answer |
| Language | TypeScript end to end | Your answer (no preference) |
| Coding agent | Claude Code, instructions in `CLAUDE.md` | Assumed |
| Currency | CAD only | Assumed |
| Privacy between spouses | None: both profiles see everything | Assumed |
| Fixtures | Synthetic CSVs that copy the column layouts of your 4 sample files, never their rows | Assumed |
| Past data | The 799 transactions in Expense-Monthly-Data.xlsx (September 2025 to September 2026) are imported once, with category and owner but no account | Your request |
| Initial categories | The 26 categories and 14 major categories from the sheet's Categories tab; owners are named Colin, Emily, and Joint as in the sheet | Your request |
| Investing and debt | Investing is a savings category: shown as Saved, not counted as spending. Debt Payments counts as spending | Your answer |
| Host | A Windows 11 computer with Docker Desktop | Your answer |
| Default owners | Tangerine accounts: Colin. RBC: Emily. Simplii and Walmart cards: Joint | Your answer |

Your sample files in `Statement Samples` look like real statements (real names on the Walmart card rows). The plan treats them as private: they stay out of the repo and agents work only from the synthetic fixtures specified in section 6.

## 1. Architecture and tech stack

One Node.js process serves both a JSON API and the built React app on a single port (8080), backed by one SQLite file. In production it runs as one Docker container; in development agents run it natively with Node, so they never need Docker to build or test.

- **Browser (laptop or phone)** loads the React single-page app and calls `/api/*`.
- **Server** validates every request and response against shared Zod schemas, runs business logic, and reads and writes SQLite.
- **Core library** holds all pure logic (CSV parsing, dedup keys, rule matching, merchant normalization, money maths) with no I/O, so it is trivially unit-testable.
- **Shared contracts package** is the single source of truth for entity and API types, imported by server and web.

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, `strict` mode | One language everywhere; the type checker catches most agent mistakes before tests run |
| Runtime | Node.js, current LTS, pinned in `.nvmrc` and the Dockerfile | Mainstream, same on Windows, macOS, and Linux sandboxes |
| Monorepo | pnpm workspaces | Shared types without publishing packages |
| API | Hono + `@hono/zod-validator` | Small, well documented, testable in-process with `app.request()` and no open port |
| Contracts | Zod schemas in `packages/shared` | Runtime validation and static types from one definition |
| Database | SQLite via `better-sqlite3`, WAL mode | One file, no server, easy backup |
| ORM and migrations | Drizzle ORM + drizzle-kit | Typed schema in TypeScript, plain SQL migrations committed to the repo |
| CSV parsing | `csv-parse` | Handles BOM, quoting, and escaped quotes seen in the samples |
| Frontend | React + Vite + React Router | The most widely documented UI stack, fast builds |
| Server state | TanStack Query | Standard caching and invalidation |
| Tables | TanStack Table | Sorting and pagination for the transaction list |
| UI kit | Tailwind CSS + shadcn/ui | Responsive by default; components live in the repo so agents can read and edit them |
| Charts | Recharts | Simple declarative API |
| Unit and integration tests | Vitest (+ Testing Library for components) | Fast, one runner for all packages |
| End-to-end tests | Playwright | Drives a real browser, includes a phone-sized viewport |
| Lint and format | ESLint (typescript-eslint) + Prettier | Most familiar to agents |
| Packaging | Multi-stage Dockerfile + `compose.yaml` | One command to start and stop |

Agents install the latest stable version of each library in M0 and pin it in the lockfile. Later milestones do not upgrade dependencies unless their task says so.

### Alternatives considered

| Alternative | Why not |
| --- | --- |
| Next.js full-stack | Server components and caching rules add failure modes for agents; a plain SPA plus API is easier to test in isolation |
| Python (FastAPI) backend + React | Two toolchains, and types must be generated across the boundary |
| Django or Rails with server-rendered pages | Quick CRUD, but weaker for interactive charts and the import preview |
| tRPC instead of REST | Good types, but explicit REST contracts are easier to write down up front and to test with plain HTTP |
| Postgres | Needs a second container and a real backup procedure, for no benefit at this scale |
| Existing apps (Actual Budget, Firefly III) | Would meet most functional needs, but not your goal of learning agent-driven development |

## 2. Data model and API contracts

Seven tables hold everything. These definitions are frozen in M1; any later change goes through the contract-change process in section 7.

### Conventions

- **Money** is stored as integer cents in `amount_cents`. Negative means money leaving the household (a purchase, a bill); positive means money arriving (pay, a refund). Each CSV mapping converts the bank's own sign convention to this one.
- **Dates** are date-only text, `YYYY-MM-DD`, with no time zone. A transaction belongs to the month of its transaction date, not its posted date.
- **Ids** are auto-increment integers. Timestamps are ISO 8601 UTC text.
- **Category kind** decides how a transaction counts. Spending for a month is the negated sum of `amount_cents` over `expense` categories, so a refund reduces its category. Income is the sum over `income` categories. `transfer` categories are excluded from all totals. Saved is the negated sum over savings categories; it is reported on its own line and never counted as spending. Left over is income minus spending minus saved.
- **Uncategorized** transactions (`category_id` null) appear in reports as their own bucket, so totals are never silently wrong.

### Tables

**owners**: the three owners; the two with `kind = person` double as the user profiles.

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| name | text, unique | Seeded as "Colin", "Emily", "Joint"; renamed in Settings |
| kind | text | `person` or `joint` |
| sort\_order | integer |  |

**accounts**: one row per bank account or card.

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| name | text, unique | e.g. "Tangerine Chequing" |
| institution | text | `rbc`, `tangerine`, `simplii`, `walmart`, `other` |
| type | text | `chequing`, `savings`, `credit_card` |
| default\_owner\_id | FK owners | Owner given to imported rows unless the mapping's owner hint says otherwise |
| csv\_mapping | JSON text | A `CsvMapping` (below), copied from a preset at creation and editable |
| archived | boolean |  |
| created\_at | text |  |

Seeded accounts, editable in Settings:

| Name | Institution | Type | Preset | Default owner |
| --- | --- | --- | --- | --- |
| Tangerine Chequing | `tangerine` | `chequing` | `tangerine-chequing` | Colin |
| Tangerine Mastercard | `tangerine` | `credit_card` | `tangerine-mastercard` | Colin |
| Simplii Visa | `simplii` | `credit_card` | `simplii` | Joint |
| Walmart Mastercard | `walmart` | `credit_card` | `walmart-mastercard` | Joint |
| RBC | `rbc` | `chequing` (assumed) | `rbc` | Emily |

The Walmart account is seeded with an empty `ownerHintMap`, so every row is Joint whichever cardholder made the purchase. The owner-hint feature stays in the mapping for later use.

**imports**: one row per uploaded file, including previews.

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| account\_id | FK accounts, nullable | Required when kind is csv; null when kind is legacy |
| filename | text |  |
| file\_sha256 | text | Warns when the identical file is uploaded twice |
| raw\_csv | text | Original file content, kept for audit and re-parsing |
| status | text | `preview`, `committed`, `undone` |
| uploaded\_by\_owner\_id | FK owners | The active profile |
| row\_count, inserted\_count, duplicate\_count, skipped\_count, error\_count | integer | Filled at preview, final at commit |
| date\_min, date\_max | text | Date range of the file |
| created\_at, committed\_at, undone\_at | text |  |
| kind | text | csv (a bank statement) or legacy (the old spreadsheet) |

**transactions**

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| account\_id | FK accounts, nullable | Null only for rows from a legacy import; the import service rejects a csv import without an account |
| import\_id | FK imports | Undo deletes by this |
| owner\_id | FK owners | Defaulted at import, editable |
| category\_id | FK categories, nullable | Null = uncategorized |
| category\_source | text, nullable | `manual`, `rule`, or `suggestion` (an accepted suggestion) |
| rule\_id | FK rules, nullable | The rule that set the category |
| date | text | Transaction date |
| posted\_date | text, nullable |  |
| amount\_cents | integer | Signed, see conventions |
| description | text | As the bank wrote it, whitespace collapsed |
| memo | text, nullable |  |
| merchant\_key | text | Normalized merchant, used for suggestions |
| bank\_category | text, nullable | The bank's own label when the file has one |
| external\_id | text, nullable | The bank's reference number when the file has one |
| dedup\_key | text | See dedup below |
| occurrence | integer | 1-based index among identical rows |
| notes | text, nullable | User note |
| excluded | boolean | Hides a row from reports without deleting it, so it is not re-imported |
| raw\_row | JSON text | Original CSV row |
| created\_at, updated\_at | text |  |

Indexes: unique `(account_id, dedup_key, occurrence)`; `(date)`; `(category_id, date)`; `(owner_id, date)`; `(merchant_key)`.

**categories**

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| name | text, unique |  |
| kind | text | `expense`, `income`, `savings, or transfer; editable per category` |
| color | text | Hex, used in charts |
| sort\_order | integer |  |
| archived | boolean | Archived categories keep their history but cannot be newly assigned |
| group\_name | text | Major category, e.g. Joy; reports can total by category or by group |

Seeded from the Categories tab of `Expense-Monthly-Data.xlsx`. Every category is `expense` except Income, which is `income`, and Investing, which is `savings`. Debt Payments is `expense`. Because the sheet counted Investing as spending, the app's spending totals for past months are lower than the sheet's by the Investing amounts; the legacy import preview shows raw per-month sums, which still match the sheet.

| Major category (`group_name`) | Categories |
| --- | --- |
| Clothing | Clothing |
| Giving | Donation, Gifts |
| Groceries | Groceries |
| Housing | Home |
| Joy | Coffee, Eating out, Entertainment, Hobbies, Alcohol |
| Kid | Baby |
| Money | Investing, Debt Payments, Income |
| Pet | Cat |
| Transportation | Gas, Car Insurance, Transportation (Other), Car Maintenance |
| Travel | Travel |
| Utilities | Internet, Phone |
| Vacation | Vacation |
| Wellbeing | Health, Personal Care |
| Education | Education |
| Transfers (added, not in the sheet) | Card Payment, Transfer; both `transfer`, needed so card payments in bank statements stay out of totals |

**rules**

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| priority | integer | Lower runs first; the first match wins |
| match\_field | text | `description`, `memo`, or `bank_category` |
| match\_type | text | `contains`, `starts_with`, `equals`, `regex`; all case-insensitive |
| pattern | text |  |
| account\_id | FK accounts, nullable | Limits the rule to one account |
| direction | text, nullable | `outflow` or `inflow`; null = both |
| set\_category\_id | FK categories |  |
| set\_owner\_id | FK owners, nullable | Optionally also sets the owner |
| enabled | boolean |  |
| created\_at | text |  |

Rules run at import commit and on demand. They never overwrite a `manual` category. Seeded rules send "PAYMENT - THANK YOU", "PAYMENT THANK YOU", and "Credit Card Payment" to Card Payment.

**budgets** (optional, M9)

| Field | Type | Notes |
| --- | --- | --- |
| id | integer PK |  |
| category\_id | FK categories |  |
| owner\_id | FK owners, nullable | Null = whole household |
| monthly\_amount\_cents | integer |  |
| effective\_from | text | `YYYY-MM`; the latest row at or before a month applies |

### CSV mapping

Each account stores one `CsvMapping`. Presets live in `packages/core/src/csv/presets.ts`.

```ts
type CsvMapping = {
  encoding: 'utf-8' | 'latin1';          // a BOM is always stripped
  hasHeader: boolean;                    // header names are trimmed before matching
  columns: {
    date: string;
    postedDate?: string;
    description: string[];               // non-empty values joined with one space
    memo?: string;
    amount?: string;                     // one signed column, OR the two below
    outflow?: string;
    inflow?: string;
    externalId?: string;
    bankCategory?: string;
    ownerHint?: string;                  // e.g. name on card
    accountFilter?: string;              // for files holding several accounts
  };
  dateFormat: 'MM/dd/yyyy' | 'M/d/yyyy' | 'yyyy-MM-dd' | 'dd/MM/yyyy';
  amountSign: 'negative_is_outflow' | 'positive_is_outflow'; // for the single column
  bankCategoryRegex?: string;            // one capture group, applied to the bankCategory column
  ownerHintMap?: Record<string, number>; // column value -> owner id
  accountFilterValue?: string;
  skipZeroAmount: boolean;
  skipWhen?: { column: string; notEquals?: string; matches?: string }[];
};
```

Amount parsing strips `$`, thousands commas, and spaces, treats parentheses as negative, and converts to cents without floating-point arithmetic.

| Preset | Date | Description | Amount | Special handling |
| --- | --- | --- | --- | --- |
| `tangerine-chequing` | `Date`, MM/dd/yyyy | `Memo` (the `Name` column is truncated) | `Amount`, negative is outflow | Skip zero-amount rows ("Posted :" marker lines) |
| `tangerine-mastercard` | `Transaction date`, MM/dd/yyyy | `Name` | `Amount`, negative is outflow | Bank category from `Memo` with regex `Category: (.+)$` |
| `simplii` | `Date`, MM/dd/yyyy | `Transaction Details` | `Funds Out` / `Funds In` | Header names carry stray spaces |
| `walmart-mastercard` | `Date`, yyyy-MM-dd; `Posted Date` | `Merchant Name` | `Amount` like `$1,200.00`, positive is outflow | BOM; `Reference Number` as external id (strip the extra quotes); `Merchant Category`; `Name on Card` as owner hint; skip rows where `Status` is not APPROVED |
| `rbc` | `Transaction Date`, M/d/yyyy | `Description 1` + `Description 2` | `CAD$`, negative is outflow | `Account Number` as account filter. Built from RBC's commonly documented layout; unverified until you supply a sample |

### Duplicate detection

`dedup_key` is the `external_id` when the file provides one, otherwise the SHA-256 of `date | amount_cents | description uppercased with whitespace collapsed`. Identical rows are legitimate (your Tangerine sample has several same-day Uber charges), so the key alone is not unique.

At preview, rows are grouped by `dedup_key`. If the file has n rows for a key and the account already has m, the first m are marked `duplicate` and the remaining n − m are `new`, numbered `occurrence` m+1 to n. Re-uploading a file therefore inserts nothing, and overlapping statements insert only the missing rows.

### Merchant key

`merchant_key` is the description uppercased, with known prefixes removed (` Interac - Purchase -  `, ` Visa Debit - Purchase -  `, `SQ *`, `TST*`, `FH*`), any `*` and the code attached to it dropped, tokens containing digits dropped, and the first three remaining tokens kept. `WAL-MART #3177 WINNIPEG MB` becomes `WAL-MART WINNIPEG MB`.

### Legacy spreadsheet import

The old tracking workbook is loaded once through a dedicated import, run by you on the real host; the workbook is real data and never enters the repo. Agents build and test against synthetic workbooks in the format specified below.

- **Validation.** The importer checks every rule in the specification and lists each violation with its sheet, row, column, and rule. Commit is blocked until the workbook has zero violations.
- **Mapping.** `Date` becomes `date`; `Description` becomes `description` and `merchant_key`; `Amount` is sign-flipped into `amount_cents` (the sheet records spending as positive); `Category` and `Owner` are looked up by exact name; `account_id` is null.
- **Category source.** Legacy rows get `category_source = manual`, so rules never recategorize them, and they feed suggestions through `merchant_key`.
- **One legacy import.** The import is one `imports` row with `kind = legacy`, previewed, committed, and undone like any other. Only one legacy import can be committed at a time; a second upload returns 409 until the first is undone.
- **No duplicate checking against statements.** Duplicate detection only compares rows within the same account. Legacy rows have no account, so they are never compared with bank statement rows. June to September 2026 are incomplete in the workbook and will also be covered by statements; making sure a transaction is not in both is the uploader's job. The CSV preview shows an informational note when a statement's dates fall in a month that has legacy rows, and nothing more.

### Legacy spreadsheet format (specification)

This section stands alone: hand it, with the workbook, to an AI or a person and ask them to make the workbook conform without changing what any transaction means.

**File**

- An Excel workbook saved as `.xlsx`. Not `.xls`, `.xlsm`, or `.csv`. No password.

**Sheets**

- One sheet per calendar month, named `MM-YYYY` with a two-digit month, for example `09-2025`. Each month appears at most once. Sheet order does not matter.
- One optional sheet named `Categories`, which is ignored.
- No other sheets, and no hidden sheets.

**Layout of each month sheet**

- Row 1 holds the headers. Cells A1 to E1 are exactly `Date`, `Description`, `Amount`, `Category`, `Owner`, with that spelling and capitalization and no extra spaces.
- Column F onward is ignored. It may keep the `Major Category` column and its formulas.
- Data starts in row 2, one transaction per row.
- No blank rows between transactions, no total, subtotal, or note rows, and no merged cells. Rows that are completely empty after the last transaction are allowed.
- Columns A to E contain typed values only, no formulas.

**Columns**

| Column | Header | Cell type | Rules |
| --- | --- | --- | --- |
| A | `Date` | Excel date (not text) | Required. Must fall in the month named by the sheet. No time of day |
| B | `Description` | Text | Required. 1 to 200 characters, no line breaks, no leading or trailing spaces |
| C | `Amount` | Number (not text) | Required. Not zero. At most 2 decimal places. No currency symbol in the value; currency cell formatting is fine. Positive means money spent. Negative means money received: a refund or income |
| D | `Category` | Text | Required. Exactly one of the 26 names below, same capitalization, no extra spaces |
| E | `Owner` | Text | Required. Exactly `Colin`, `Emily`, or `Joint`, no extra spaces |

**Allowed categories**

Clothing, Donation, Gifts, Groceries, Home, Coffee, Eating out, Entertainment, Hobbies, Alcohol, Baby, Investing, Debt Payments, Cat, Gas, Car Insurance, Transportation (Other), Car Maintenance, Travel, Internet, Phone, Vacation, Health, Personal Care, Education, Income.

**Meaning rules**

- A row with category `Income` has a negative amount.
- A refund keeps the category of the original purchase and has a negative amount.
- Two rows that are identical in every column are two separate transactions; both are imported.
- When conforming an existing workbook, never add, remove, merge, or reorder transactions, and never change a date, an amount's sign, or an owner. If a row cannot be made valid without guessing (for example a missing description), list it for the owner to fix instead of inventing a value.

**Changes the current workbook needs** (checked 16 November 2026: 13 month sheets, 799 transactions)

| Where | Problem | Fix |
| --- | --- | --- |
| D1 and E1 on all 13 month sheets | Headers read `Catergory` and `Type` | Rename to `Category` and `Owner` |
| 15 cells in column E | `Joint` followed by a space | Remove the trailing space |
| 3 cells in column D | `Car maintenance` | Change to `Car Maintenance` |
| 15 cells in column C, across 7 sheets | Amount is a formula | Replace with its calculated value |
| `10-2025`, "Sushi and Indian food" | Amount 54.463 has 3 decimals | Round to 54.46 |
| `11-2025`, the −2,500 Baby row | Description is blank | Owner to supply a description |

### API

All routes are under `/api`, speak JSON, and are defined as Zod schemas in `packages/shared/src/api.ts`. Errors use `{ "error": { "code": string, "message": string, "details"?: unknown } }` with 400 for validation, 404 for missing, 409 for conflicts. The active profile is read from a `profile` cookie holding an owner id; routes that record who acted return 401 without it.

| Method and path | Purpose |
| --- | --- |
| GET `/health` | `{ status: "ok", version }` |
| GET `/owners` · PATCH `/owners/:id` | List; rename |
| POST `/session` · DELETE `/session` | Set or clear the profile cookie |
| GET `/accounts` · POST `/accounts` · PATCH `/accounts/:id` | Manage accounts and their mapping |
| GET `/csv-presets` | Preset mappings for the account form |
| POST `/imports/preview` | Multipart `file` + `accountId`. Creates an import in `preview` and returns counts plus every row with status `new`, `duplicate`, `skipped`, or `error`, and the owner and rule-assigned category it would get |
| POST `/imports/:id/commit` | Inserts the `new` rows, applies rules, takes a backup. 409 unless status is `preview` |
| POST `/imports/:id/undo` | Deletes that import's transactions, sets status `undone` |
| GET `/imports` · GET `/imports/:id` | Import history |
| GET `/transactions` | Query: `owner`, `account`, `category` (id or `none`), `from`, `to`, `q`, `minCents`, `maxCents`, `excluded`, `sort` (`date`, `amount`, `description`), `order`, `page`, `pageSize`. Returns `{ items, total }`. With `category=none`, each item carries `suggestedCategoryId` |
| PATCH `/transactions/:id` | Edit `ownerId`, `categoryId`, `notes`, `excluded` |
| POST `/transactions/bulk` | `{ ids, patch }` with the same fields |
| GET, POST `/categories` · PATCH, DELETE `/categories/:id` | DELETE archives; `?reassignTo=id` moves its transactions first |
| GET, POST `/rules` · PATCH, DELETE `/rules/:id` | Manage rules |
| POST `/rules/test` | Takes an unsaved rule, returns match count and 10 sample transactions |
| POST `/rules/apply` | Runs rules over uncategorized and rule-categorized transactions, returns the number changed |
| GET `/reports/monthly` | Query `from`, `to` (`YYYY-MM`), `owner` (id or `all`). Also takes groupBy (category or group). Returns per month and category or group, with savedCents alongside the fields listed here: `spendingCents`, `incomeCents`, `count` |
| GET `/reports/compare` | Query `month`, `owner`. Returns per category: this month, previous month, same month last year, trailing 3-month average |
| GET, PUT `/budgets` | Optional, M9 |
| POST `/backup` · GET `/backup/latest` | Take a backup now; download the newest |
| POST /imports/legacy/preview | Multipart file (.xlsx), no account. Creates an import with kind legacy in preview and returns the same row shape as a CSV preview, plus per-month totals. Commit and undo use the existing routes. GET /transactions also accepts account=none for rows with no account |

## 3. Key user flows

The monthly session is three flows in order: import each statement, clear the uncategorized queue, then review the month.

### First-time setup: legacy spreadsheet

1. In **Settings**, choose **Import legacy spreadsheet** and pick `Expense-Monthly-Data.xlsx`.
2. The preview shows a row count and spending total per month to compare with the sheet, plus any error or flagged rows.
3. Fix any listed violations in the workbook and upload again; commit is available once there are none.
4. Legacy transactions then appear everywhere with account shown as "None", and can be filtered with **Account: None**.
5. Create your real accounts and import bank statements. For June to September 2026, where the workbook is incomplete, check each statement against the legacy rows yourself and untick rows already recorded; the app does not detect these duplicates.

### Import

1. Download a CSV from the bank and open **Import**.
2. Pick the account and choose the file. The server parses it with that account's mapping and stores it as a preview.
3. The preview shows counts (new, duplicate, skipped, error) and a table of every row with its status, parsed date, amount, description, owner, and any category a rule would assign. Error rows show the reason. If the same file was imported before, a warning says so.
4. If the columns look wrong, cancel and fix the account's mapping. Otherwise press **Commit**.
5. Commit inserts only the new rows, applies rules, and takes a backup. The result links to the uncategorized queue.
6. **Import history** lists every import with its counts and an **Undo** button. Undo asks for confirmation, states how many manually categorized transactions will be lost, and deletes that import's rows.

### Categorize

1. **Uncategorized** shows the queue with a count, oldest first, grouped by merchant key so repeated merchants are handled together.
2. Each row offers the suggested category as a one-tap button, plus a full category picker. Keyboard shortcuts move down the queue on a laptop.
3. After a manual choice, the app offers "Always categorize WAL-MART as Groceries?". Accepting creates a rule prefilled from the merchant key, shows how many existing transactions it matches, and applies it.
4. Owner can be changed on any row from the same screen.
5. The queue is done when the count reaches zero. Card payments and transfers get a `transfer` category so they drop out of totals.

Suggestions come from history: the most frequent category among already-categorized transactions with the same merchant key, falling back to the category most often paired with the row's bank category.

### Monthly review

1. **Dashboard** opens on the most recent complete month with an owner switch (Me / Wife / Joint / All) that applies to everything on the page.
2. Top cards: income, spending, saved, left over, and the uncategorized count if any remain.
3. A category breakdown chart for the month, and a table of categories with this month, last month, the same month last year, and the 3-month average, with differences.
4. **Trends** shows stacked monthly spending by category over 12 or 24 months, and a line per selected category.
5. Clicking any category or bar opens **Transactions** filtered to that category, month, and owner. The transaction list supports search, sorting, filters, and inline edits.
6. With budgets enabled (M9), each category row shows a bar and an over or under amount.

## 4. Running on the home network

`docker compose up -d` starts the app and `docker compose down` stops it; data lives in a Docker volume and survives both.

### Start, stop, reach

The host is a Windows 11 computer, so the `.cmd` scripts are the ones you will use and the ones checked at H2 and H4; the `.sh` scripts are kept for running on macOS later.

- `scripts/start.cmd` (Windows) and `scripts/start.sh` (macOS) run `docker compose up -d --build`, wait for `/api/health`, then print the address to use from other devices, for example `http://192.168.1.50:8080`.
- `scripts/stop.cmd` and `scripts/stop.sh` run `docker compose down`.
- From a phone or second laptop on the same Wi-Fi, open the printed address. `http://<computer-name>.local:8080` usually works too.
- One-time setup on the host: allow port 8080 through the firewall for **private networks only** (Windows prompts on first start), and reserve the host's IP address in the router so the address stays the same.

### Keeping it on the LAN

- The app listens on plain HTTP on port 8080. Do not add a port-forwarding rule on the router, and do not allow the port on the Windows "Public" network profile.
- You chose no password, so anyone who joins your Wi-Fi can open the app. If guests use the main network, put them on the router's guest network, or ask for the passcode option to be added later.

### Data and backups

- The live database is `/data/finance.sqlite` inside a named Docker volume, `finance_data`. A named volume is used instead of a host folder because SQLite file locking is unreliable on Docker Desktop's shared host folders.
- `./backups` on the host is mounted into the container. The server writes a consistent snapshot there with `VACUUM INTO` at every start and after every import commit, named `finance-YYYYMMDD-HHMMSS.sqlite`, and keeps the newest 30.
- Settings has **Download backup**, which works from any device.
- Restore: `scripts/restore <backup-file>` stops the app, copies the file into the volume, and starts it again.
- Copy the `backups` folder to a USB drive now and then.

### Where the project lives

Your chosen folder is inside OneDrive. Keep the repo and especially the `backups` folder **outside** any OneDrive-synced folder: a backup synced to OneDrive is financial data leaving your network, and syncing a code repo with `node_modules` is slow and error-prone. Use something like `C:\dev\finance-tracker`.

## 5. Milestones

Twelve milestones, each one agent session ending in a merged pull request with `pnpm check:all` green. M0 and M1 are strictly sequential; after M1, the contracts are frozen and the tracks marked parallel can run at the same time in separate git worktrees.

| # | Milestone | Depends on | Can run alongside | Human checkpoint after |
| --- | --- | --- | --- | --- |
| M0 | Scaffold and tooling | none | none |  |
| M1 | Contracts, schema, seed, fixtures | M0 | none | H1: review data model, categories, fixtures |
| M2 | CSV engine (pure library) | M1 | M3, M5 |  |
| M3 | App shell, profiles, accounts | M1 | M2, M5 |  |
| M4 | Import flow | M2, M3 | M6, M8 | H2: import one real statement per bank |
| M5 | Transaction list and editing | M1 | M2, M3 |  |
| M6 | Categories and rules | M5 | M4, M8 |  |
| M7 | Uncategorized queue and suggestions | M4, M6 | M8 |  |
| M8 | Reports and dashboard | M5 | M4, M6, M7 | H3: review a real month |
| M9 | Budgets (optional) | M8 | M10 |  |
| M10 | Backups, scripts, mobile pass, full journey test | M7, M8 | M9 | H4: final acceptance |
| ML | Legacy spreadsheet import (runs right after M4) | M4 | M5, M6, M8 | H2 also loads the real workbook |

Every milestone's acceptance criteria include, without restating it: `pnpm check:all` passes, new logic has tests, `docs/STATUS.md` is updated, and no file outside the milestone's listed areas is changed except by the contract-change process.

### M0: Scaffold and tooling

Tasks:

- Create the pnpm workspace and the repo layout from section 7, with TypeScript `strict` and a shared base `tsconfig`.
- Configure ESLint, Prettier, Vitest, and Playwright; add the root scripts listed in section 6.
- Server: Hono app with `GET /api/health`, serving `apps/web/dist` as static files with SPA fallback. Port and database path come from the `PORT` and `DATABASE_PATH` environment variables.
- Web: Vite React app with Tailwind and shadcn/ui, showing a page that calls `/api/health`. The Vite dev server proxies `/api` to the server.
- Dockerfile (multi-stage) and `compose.yaml` with the `finance_data` volume and `./backups` mount.
- Write `CLAUDE.md`, `README.md`, `docs/STATUS.md`, and copy this plan to `docs/PLAN.md`. Add `.gitignore` entries for `data/`, `backups/`, `*.sqlite`, and `Statement Samples/`.

Acceptance:

- `pnpm install && pnpm check:all` passes on a clean clone, including one unit test per package and one Playwright test that loads the page and sees the health status.
- `pnpm dev` serves the web app with hot reload.
- `docker compose up -d --build` serves the same page on port 8080 and `docker compose down` stops it.

### M1: Contracts, schema, seed, fixtures

Tasks:

- `packages/shared`: Zod schemas and inferred types for every entity and every request and response in section 2, plus `CsvMapping`.
- `apps/server/src/db/schema.ts`: Drizzle schema for all seven tables with indexes; generate the first migration; run migrations at server start.
- Seed (idempotent, runs at start on an empty database): three owners, default categories, the five accounts in section 2, the three card-payment rules.
- `fixtures/csv`: the synthetic files specified in section 6, produced by a seeded generator script that is committed alongside its output.
- `pnpm seed:demo`: fills a database with 14 months of synthetic transactions across 5 accounts, about 80% categorized, for UI work and report tests.
- A typed fetch client in `apps/web/src/api` generated by hand from the shared schemas, validating responses in development.

Acceptance:

- A test asserts each Drizzle table's columns match its Zod entity schema.
- Starting the server on an empty path creates and seeds the database; starting again changes nothing.
- `pnpm seed:demo` is deterministic: two runs produce identical row counts and totals, asserted by a test.
- Fixture files exist and match the header rows in section 6 byte for byte.

### M2: CSV engine

All work is in `packages/core/src/csv`, with no database access.

Tasks:

- `parseCsv(content: Buffer, mapping: CsvMapping, ownerDefaults)` returns one `ParsedRow` per data row: either normalized fields or `{ status: "skipped" | "error", reason }`, each with its line number and raw row.
- Date parsing per `dateFormat`, amount parsing, sign normalization, description joining, bank-category regex, owner hint, account filter, skip rules.
- `dedupKey(row)` and `merchantKey(description)`.
- The five presets.
- `assignOccurrences(parsedRows, existingCountsByKey)` implementing the n − m rule.

Acceptance:

- Golden tests: each fixture parses to a committed expected-JSON file.
- Amount tests cover `$1,200.00`, `-$1,200.00`, `(45.10)`, `0.01`, empty, and non-numeric input.
- The Walmart fixture yields external ids without quote characters and maps two cardholder names to two owners.
- The Tangerine chequing fixture skips its zero-amount marker rows and reports them as `skipped`.
- A malformed fixture (bad date, missing column, short row) produces `error` rows with reasons and does not throw.
- Occurrence tests: same file twice gives zero new; the overlapping pair gives exactly the expected new count; four identical same-day rows against two existing gives two new.
- Line coverage of `packages/core` is at least 90%.

### M3: App shell, profiles, accounts

Tasks:

- API: owners, session, accounts, csv-presets.
- Web: profile picker shown when no cookie is set, with a profile switcher in the header; navigation (Dashboard, Transactions, Uncategorized, Import, Rules, Categories, Settings) as a sidebar on desktop and a bottom bar on phones.
- Settings: rename owners; list, create, edit, and archive accounts. The account form picks a preset, then shows the mapping as editable fields, including the owner-hint value map.

Acceptance:

- API tests cover each route's success and validation-failure cases.
- Playwright: choose a profile, create an account from the `walmart-mastercard` preset, map two cardholder names to owners, reload, and see it persisted.
- The shell is usable at a 390-pixel-wide viewport with no horizontal scrolling.

### M4: Import flow

Tasks:

- API: preview, commit, undo, list, detail. Commit runs in one database transaction and calls the rule engine if M6 has landed, through an interface that is a no-op until then.
- Previews older than 24 hours are deleted at server start.
- Web: Import page (account, file, preview table with status filter, commit), result screen, Import history with undo.

Acceptance:

- Integration tests: preview then commit inserts the expected rows; a second preview of the same file shows all duplicates and the identical-file warning; the overlapping fixture inserts only the new rows; undo removes exactly that import's rows; committing twice returns 409.
- A file whose headers do not match the mapping returns a clear 400 naming the missing columns.
- Playwright: import a fixture, see the counts, commit, find the rows in the database through the API, undo, and see them gone.

### ML: Legacy spreadsheet import

Tasks:

- `packages/core/src/legacy`: `parseLegacyWorkbook(buffer, categories, owners)` using `exceljs`, enforcing every rule in the format specification in section 2 and returning the same `ParsedRow` shape as the CSV engine, with one `error` per violation.
- A generator script that writes two synthetic fixtures: `fixtures/legacy/legacy-valid.xlsx` and `fixtures/legacy/legacy-invalid.xlsx`.
- API: `POST /imports/legacy/preview`; commit and undo through the existing routes; commit returns 409 while the preview has errors or another legacy import is committed; `account=none` on `GET /transactions`.
- CSV preview: every row gets an include checkbox (default on for `new` rows) so the uploader can leave out rows already recorded, plus the informational note when the file's dates fall in a month with legacy rows. No matching against legacy rows.
- Web: the Settings entry and preview with per-month totals and the violation list; "None" for a missing account in the transaction list and filter.
- Add `*.xlsx` to `.gitignore`, with an exception for `fixtures/legacy/`.

Acceptance:

- Golden test: the valid fixture parses to a committed expected-JSON file with sign-flipped amounts in cents.
- The invalid fixture yields exactly one error per planted violation, each naming sheet, row, column, and rule; one test per rule in the specification.
- Committing the valid fixture inserts rows with null `account_id`, `category_source = manual`, and the expected per-month totals; undo removes them all; committing a preview with errors returns 409; a second legacy commit returns 409.
- A CSV commit without an account is rejected with 400.
- After a legacy commit, a CSV row with the same date, amount, and description as a legacy row is still marked `new` and is inserted.
- A CSV row unticked in the preview is not inserted and is counted as skipped.
- Reports include legacy rows under every owner filter.
- Playwright: upload the valid fixture in Settings, commit, and find a legacy row with **Account: None**.

Expected at H2 with the real workbook, once it conforms: 13 monthly sheets, 799 rows, zero violations.

### M5: Transaction list and editing

Developed against `pnpm seed:demo` data, so it does not wait for import.

Tasks:

- API: `GET /transactions` with every filter and sort in section 2, `PATCH`, and bulk patch. Search matches description, memo, and notes, case-insensitive.
- Web: Transactions page with a filter bar (owner, account, category, date range, amount range, search), sortable columns, pagination, inline owner and category editing, row selection with bulk actions, and filters stored in the URL.
- On phones the table becomes a list of cards.

Acceptance:

- Integration tests for each filter alone and three combinations, each sort, and pagination boundaries.
- Setting a category through the API records `category_source = manual`.
- Playwright: search for a merchant, sort by amount, change one row's owner, bulk-categorize three rows, reload, and see all changes kept.

### M6: Categories and rules

Tasks:

- `packages/core/src/rules.ts`: `matchRule(transaction, rules)` as a pure function.
- API: categories and rules routes, `rules/test`, `rules/apply`. Wire the engine into import commit.
- Web: Categories page (create, rename, kind, color, reorder, archive with reassignment); Rules page (list by priority, create and edit with a live match preview, reorder, enable or disable, apply now).

Acceptance:

- Unit tests cover every `match_type`, case-insensitivity, the account and direction limits, priority order, disabled rules, and an invalid regex (rejected with 400 at save, never thrown at match time).
- `rules/apply` never changes a transaction whose `category_source` is `manual`.
- Archiving a category with `reassignTo` moves its transactions; without it, the transactions keep the archived category.
- Playwright: create "description contains COSTCO sets Groceries", see the preview count, apply, and see the matching rows categorized.

### M7: Uncategorized queue and suggestions

Tasks:

- Suggestion query as described in section 3, returned on `GET /transactions?category=none`.
- Web: Uncategorized page with merchant grouping, one-tap accept, picker, keyboard shortcuts, the "always categorize" prompt that creates a rule, and a header badge with the count.

Acceptance:

- Integration tests: a merchant with history returns its most frequent category; a merchant with none falls back to the bank category pairing; neither gives null.
- Accepting a suggestion records `category_source = suggestion`.
- Playwright: import a fixture, clear the whole queue using suggestions, one manual pick, and one created rule; the badge reaches zero.

### M8: Reports and dashboard

Tasks:

- API: `reports/monthly` and `reports/compare`, implemented as SQL aggregates that respect category kind and the `excluded` flag.
- Web: Dashboard and Trends as described in section 3, with the owner switch, month picker, a switch between categories and major categories, and drill-down links to Transactions.

Acceptance:

- Report tests run against a small hand-written dataset with totals worked out in the test file: a refund reduces its category; transfers and excluded rows are absent; savings categories count toward saved and not toward spending; left over equals income minus spending minus saved; uncategorized is its own bucket; each owner filter matches a manual sum; All equals the sum of the three owners.
- Comparison tests cover a month with no prior-year data (returns null, not zero).
- Playwright: switch owner and see the totals change to the expected seeded values; click a category and land on a correctly filtered transaction list.
- Charts render at 390 pixels wide without overflow.

### M9: Budgets (optional)

Tasks: budgets API; a Budgets settings page; over and under indicators on the Dashboard category table.

Acceptance: tests cover the effective-from lookup and household versus per-owner budgets; the indicator shows the correct sign and amount for seeded data.

### M10: Backups, scripts, mobile pass, full journey

Tasks:

- Backup on start and after commit with retention of 30; `POST /backup`; download route; Settings controls.
- `scripts/start`, `stop`, and `restore` for Windows and macOS.
- A responsive review of every page at 390 pixels wide, fixing what breaks.
- `README.md` for the household: first-time setup, firewall, monthly routine, restore.
- One Playwright journey covering the full monthly session, run at desktop and phone viewports.

Acceptance:

- Tests: a backup file opens as a valid SQLite database with the same row counts; retention deletes the oldest beyond 30.
- A scripted restore test: take a backup, add a transaction, restore, and the transaction is gone.
- The full-journey test passes at both viewports against the Docker image, not only the dev server.

## 6. Testing and verification

An agent's work is done only when `pnpm check:all` exits zero; that one command runs every check below.

| Command | Runs |
| --- | --- |
| `pnpm format:check` | Prettier |
| `pnpm lint` | ESLint, zero warnings allowed |
| `pnpm typecheck` | `tsc --noEmit` in every package |
| `pnpm test` | Vitest unit, integration, and component tests with coverage |
| `pnpm build` | Production build of web and server |
| `pnpm check` | The five above, in that order; the fast loop, under a minute |
| `pnpm e2e` | Playwright against a built server on a temporary database |
| `pnpm check:all` | `check` then `e2e`; required before every pull request |

### Test layers

| Layer | Scope | How |
| --- | --- | --- |
| Unit | `packages/core`: parsing, amounts, dedup, merchant key, rule matching | Pure functions, golden files, 90% line coverage enforced |
| Integration | Every API route | Hono `app.request()` against a fresh temporary SQLite file per test file; no network port |
| Contract | Schema drift | Drizzle columns compared with Zod schemas; every route's response parsed by its schema inside the integration tests |
| Component | Preview table, category picker, filter bar | Testing Library, only where logic lives in the component |
| End to end | Four journeys: import and undo; categorize with a rule; monthly review with owner switch; full session at phone width | Playwright with Chromium, traces saved on failure |

Rules for tests: no test depends on another test's data, on the current date (inject a clock), or on network access. A bug fix starts with a failing test.

A GitHub Actions workflow runs `pnpm check:all` on every pull request, so a human reviewer sees a pass or fail without running anything. It uses only synthetic data.

### Synthetic CSV fixtures

Fixtures live in `fixtures/csv`, are produced in M1 by a seeded generator, and reproduce the exact header bytes and quoting style of each bank. All names, card numbers, and reference numbers are invented; cardholders are "ALEX SAMPLE" and "JAMIE SAMPLE".

| File | Rows | Must contain |
| --- | --- | --- |
| `tangerine-chequing-2026-09.csv` | 40 | Two pay deposits, an e-Transfer in, a card payment, an ATM withdrawal, two zero-amount "Posted :" rows, a 0.01 interest row |
| `tangerine-chequing-2026-10-overlap.csv` | 35 | The last 10 rows of the September file plus 25 new rows |
| `tangerine-mastercard-2026-10.csv` | 40 | Four identical same-day rows, one refund (`CREDIT`, positive), one "PAYMENT - THANK YOU", six distinct bank categories in `Memo` |
| `simplii-visa-2026-10.csv` | 15 | Quoted descriptions containing commas, one payment in `Funds In` |
| `walmart-mastercard-2026-09.csv` | 30 | BOM, two cardholders, an interest row with an empty reference number, a negative payment over $1,000, one row with `Status` DECLINED |
| `rbc-chequing-2026-10.csv` | 30 | Rows for two account numbers, some with an empty `Description 2` |
| `malformed.csv` | 8 | A bad date, a non-numeric amount, a short row, a blank line |
| `wrong-headers.csv` | 5 | Valid CSV whose headers match no preset |
| fixtures/legacy/legacy-valid.xlsx and legacy-invalid.xlsx | 60 over 3 monthly sheets | Valid: a Categories sheet, refunds and income as negative amounts, two identical rows, a Major Category formula column, empty trailing rows. Invalid: one planted violation of every rule in the format specification |

Header and example rows, to be reproduced exactly (the Simplii header's spaces after commas and its trailing space are intentional; the Walmart file starts with a UTF-8 BOM):

```csv
Date,Transaction,Name,Memo,Amount
09/28/2026,OTHER,EFT Deposit from Northwind Mfg,EFT Deposit from Northwind Mfg,1850.00
10/05/2026,OTHER,Interac - Purchase - SHELL C1234,Interac - Purchase - SHELL C12345 WINNIPEG  MB  CA,-61.20
10/09/2026,OTHER,Posted :08 Oct 2026,Posted :08 Oct 2026,0.00
```

```csv
Transaction date,Transaction,Name,Memo,Amount
10/30/2026,DEBIT,COSTCO WHOLESALE W1234 WINNIPEG MB,Rewards earned: 1.02 ~ Category: Groceries,-204.11
10/26/2026,CREDIT,PAYMENT - THANK YOU,,1500.00
10/22/2026,CREDIT,TRAILHEAD OUTFITTERS London ON,Rewards earned: -0.40 ~ Category: Other,80.00
```

```csv
Date, Transaction Details, Funds Out, Funds In, Credit Card 
10/19/2026,"AMZN Mktp CA*AB1CD2EF3 866-216-1072, ON",45.99,,4500********0000
10/23/2026,PAYMENT THANK YOU/PAIEMEN T MERCI,,400.00,4500********0000
```

```csv
"Date","Posted Date","Reference Number","Activity Type","Status","Transaction Card Number","Merchant Category","Merchant Name","Merchant City","Merchant State/Province","Merchant Country","Merchant Postal Code/Zip","Amount","Rewards","Name on Card"
"2026-09-16","2026-09-17","""11111111111111111111111""","TRANS","APPROVED","************0002","Grocery Stores and Supermarkets","WAL-MART #1234","WINNIPEG","MB","CAN","R0R 0R0","$30.22","","JAMIE SAMPLE"
"2026-09-21","2026-09-22","""2222222222222222222-222""","TRANS","APPROVED","************0001","","PAYMENT - THANK YOU","","","","","-$1,200.00","","ALEX SAMPLE"
"2026-10-02","2026-10-02","","TRANS","APPROVED","************0001","","PURCHASE INTEREST","","","","","$0.31","","ALEX SAMPLE"
```

```csv
"Account Type","Account Number","Transaction Date","Cheque Number","Description 1","Description 2","CAD$","USD$"
Chequing,00000-1234567,10/3/2026,,"PAYROLL DEPOSIT","NORTHWIND MFG",2100.00,
Chequing,00000-1234567,10/5/2026,,"HYDRO BILL PMT",,-143.76,
```

The RBC block is the layout RBC is commonly reported to export, written from memory. Replace it once you have a real export to compare against.

## 7. Agent workflow

Each milestone is one agent session on its own branch, started from a fixed prompt and ended by a pull request; the repo itself carries everything the agent needs to know.

### Repo layout

```text
finance-tracker/
  CLAUDE.md                 agent instructions (outline below)
  README.md                 household guide: setup, start, stop, restore
  compose.yaml
  Dockerfile
  package.json              root scripts: dev, check, e2e, check:all, seed:demo
  pnpm-workspace.yaml
  docs/
    PLAN.md                 this plan
    STATUS.md               milestone log, updated by every session
    DECISIONS.md            dated contract changes and deviations
  packages/
    shared/src/             Zod entity schemas, api.ts, CsvMapping
    core/src/               csv/, rules.ts, merchant.ts, money.ts, dedup.ts
  apps/
    server/src/
      index.ts              starts the server
      app.ts                builds the Hono app (imported by tests)
      db/                   schema.ts, migrations/, migrate.ts, seed.ts, demo-seed.ts
      routes/               one file per resource
      services/             import, rules, reports, backup
    web/src/
      api/                  typed client, query hooks
      pages/                one folder per page
      components/           shared UI, shadcn components under ui/
  fixtures/
    csv/                    synthetic statements
    expected/               golden parse results
    generate.ts             seeded generator
  e2e/                      Playwright specs
  scripts/                  start, stop, restore (.cmd and .sh)
```

File ownership keeps parallel sessions from colliding: M2 touches only `packages/core/src/csv` and `fixtures/expected`; M3, M5, M6, and M8 each own their route files, their service file, and their page folder. Shared files that several milestones must touch (the router in `app.ts`, the navigation list, the web route table) are append-only lists, one line per feature.

### CLAUDE.md outline

```markdown
# Finance Tracker: agent instructions

## What this is
Local household finance tracker. Read docs/PLAN.md sections 1, 2 and your
milestone in section 5 before writing code. Read docs/STATUS.md for current state.

## Commands
pnpm install        install
pnpm dev            server on 8080, web on 5173 with /api proxy
pnpm check          format, lint, typecheck, tests, build (run often)
pnpm check:all      check plus Playwright (must pass before you finish)
pnpm seed:demo      fill a dev database with synthetic data

## Architecture rules
- packages/shared is the only definition of entity and API shapes.
- packages/core is pure: no database, filesystem, network, or Date.now().
- Routes validate input and output with shared schemas and call services.
  SQL lives in services, never in routes or web code.
- Money is integer cents. Negative = outflow. Never use floats for money.
- Dates are 'YYYY-MM-DD' strings. Never construct a Date from one for storage.
- The web app talks to the server only through apps/web/src/api.

## Conventions
- TypeScript strict. No `any`, no `@ts-ignore`, no eslint-disable without a
  comment explaining why.
- Named exports. One React component per file. Files in kebab-case.
- Database columns snake_case, TypeScript and JSON camelCase.
- No new dependency without a line in docs/DECISIONS.md.
- Never weaken, skip, or delete a test to make checks pass.

## Data safety
- Use only fixtures/csv and pnpm seed:demo. Never read or commit real
  statements, *.sqlite files, or anything under data/ or backups/.

## Changing contracts
If your task needs a change to packages/shared or db/schema.ts beyond what
PLAN.md specifies: stop, write the proposed change in docs/DECISIONS.md,
make it in a separate first commit with a migration, and flag it at the top
of the pull request.

## Definition of done
1. Every acceptance criterion for the milestone is met and covered by a test.
2. pnpm check:all passes locally.
3. docs/STATUS.md has an entry: what was built, deviations, follow-ups.
4. Only files in the milestone's area changed, plus append-only shared lists.
5. Pull request opened with the acceptance checklist ticked item by item.

## When stuck
After three failed attempts at the same problem, stop and write up what you
tried in docs/STATUS.md under "Blocked" instead of working around it.
```

### Task handoff

1. **Start.** You open a session on a new branch `m<N>-<slug>` (a separate git worktree when running milestones in parallel) with this prompt: "Implement milestone M\<N> from docs/PLAN.md. Follow CLAUDE.md. Finish by opening a pull request."
2. **Plan.** The agent reads the plan and status, then lists its steps before coding. No approval is needed unless it proposes a contract change.
3. **Build.** The agent works test-first where practical and runs `pnpm check` as it goes.
4. **Verify.** The agent runs `pnpm check:all`, then ticks each acceptance criterion in the pull request description, naming the test that proves it.
5. **Record.** The agent appends to `docs/STATUS.md`.
6. **Review.** For high-stakes milestones (M2 parsing and M8 report maths), a second agent session that did not write the code reviews the pull request against the acceptance criteria. CI must be green.
7. **Merge.** You merge. At a checkpoint milestone you also do the human check below first.

### Human checkpoints

| When | What you do | Time |
| --- | --- | --- |
| Before M0 | Create a private GitHub repo outside OneDrive; confirm the open questions in section 8 | 15 min |
| H1, after M1 | Read the seeded categories and owner names; compare each fixture header with your real file's header | 20 min |
| H2, after M4 | On the real host, create your real accounts and import one real statement per bank; check counts and five random rows each; re-import to confirm zero new. Once ML is merged, load the real workbook first and compare each month's total with the sheet | 45 min |
| H3, after M8 | Categorize one real month and check two category totals against a manual sum | 30 min |
| H4, after M10 | Open the app from a phone, run a restore, read the README | 20 min |

Problems found with real data at H2 are reported to agents as a description plus a hand-edited synthetic row that reproduces the issue, never as the real file.

## 8. Risks, open questions, assumptions

The largest risk is that real bank exports differ from the fixtures; H2 exists to catch that early, before categorization and reports are built on top.

### Risks

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Real CSV layouts differ from fixtures, or a bank changes its export | Imports fail or misread columns | Mapping is data, editable per account; header mismatch gives a clear error; H2 uses real files |
| RBC layout is unverified | RBC import may not work at H2 | Provide a sample before M2, or accept fixing the preset after H2 |
| A bank rewrites a description between two downloads of the same period | The same purchase imports twice | Preview shows near-matches (same account, date, and amount with a different description) as "possible duplicate" for you to untick; add this to M4 if seen at H2 |
| Undo deletes manual categorization of that import | Lost work | Confirmation states the count; a backup is taken at every commit |
| Transfers and card payments left uncategorized | Spending or income overstated | Seeded card-payment rules; uncategorized shown as its own bucket and as a dashboard warning |
| No password on the LAN | Anyone on your Wi-Fi can read and edit | Guest network for visitors; firewall limited to private networks; passcode can be added in one small milestone |
| SQLite on Docker Desktop host folders | Locking errors or corruption | Live database in a named volume; only finished backup files go to the host folder |
| Backups synced to OneDrive | Financial data leaves your network | Repo and backups outside OneDrive |
| Parallel agents drift from the contracts | Merge conflicts, mismatched types | Contracts frozen in M1; contract tests; the change process in CLAUDE.md |
| Agents weaken tests to get green | False confidence | Rule in CLAUDE.md; independent review on M2 and M8; your spot checks at H2 and H3 |
| A milestone is too big for one session | Half-finished branch | The agent records progress in STATUS.md and you start a follow-up session on the same branch |
| A bank statement covers a period already in the legacy workbook | The same purchases are counted twice | Accepted by design: the uploader checks June to September 2026 by hand. The preview shows a note for overlapping months and lets rows be unticked |
| Legacy data is uneven: income appears only from March 2026 and only for Colin, and many early rows are dated the 1st as a placeholder | Income and net figures before March 2026 are incomplete; day-level views of early months mislead | Reports are monthly, so spending totals are unaffected; treat income comparisons as valid from the first full statement month |

### Open questions for you

- [ ] Resolved: five accounts are seeded with the default owners listed in section 2. Still to confirm: whether the RBC account is chequing, savings, or a credit card, and whether there is more than one.
- [ ] Can you export one RBC CSV so its header row can be checked against the preset?
- [ ] Resolved, yes: rather than taking each row's owner from the name on the card, should the whole card be Joint?
- [ ] Resolved: the host is a Windows 11 computer.
- [ ] Resolved: owners are named Colin, Emily, and Joint, as in the sheet.

* [ ] Resolved: Debt Payments counts as spending; Investing is a savings category, shown as Saved and excluded from spending.

### Assumptions

- Claude Code is the coding agent, and code lives in a private GitHub repository that never contains real data.
- All accounts are in Canadian dollars; the RBC `USD$` column is ignored.
- A few thousand transactions a year, so no performance work beyond the listed indexes.
- Both of you see and edit everything; the profile only sets the default owner filter and records who imported.
- The app is used by one or two people at a time; no concurrent-edit handling beyond SQLite's own locking.
- English only; dates display as `YYYY-MM-DD` and amounts as `$1,234.56`.
- Transactions are never edited in amount, date, or description after import; corrections happen by excluding a row.
- Out of scope for v1, with room left in the model: split transactions, a passcode, manual transaction entry, receipt attachments, CSV export of reports.

* The legacy workbook is imported once, at setup. It is not an ongoing input, and its transactions never get an account.
* The sheet's `Type` column is the owner, and its `Major Category` column always agrees with the Categories tab (it does in all 799 rows).
