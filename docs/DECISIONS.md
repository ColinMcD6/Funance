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
