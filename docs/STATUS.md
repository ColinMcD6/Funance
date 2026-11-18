# Status

Milestone log. Every session appends an entry: what was built, deviations, follow-ups.
Plan: [PLAN.md](PLAN.md). Deviations and new dependencies: [DECISIONS.md](DECISIONS.md).

| Milestone                            | State       |
| ------------------------------------ | ----------- |
| M0 Scaffold and tooling              | Done        |
| M1 Contracts, schema, seed, fixtures | Next        |
| M2 to M10, ML                        | Not started |

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
- The GitHub Actions workflow has not run yet; check it on the first pull request.
