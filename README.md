# Funance

A household finance tracker that runs on one computer at home and is opened from any
browser on the home network. It imports bank CSV statements, categorizes spending and
income, and reports by month. The full design is in [docs/PLAN.md](docs/PLAN.md); progress
is logged in [docs/STATUS.md](docs/STATUS.md).

> Status: milestone M0 (scaffold). The app currently shows a single page with the server's
> health status. The full household guide (first-time setup, firewall, monthly routine,
> restore) is written in milestone M10.

## Run it at home (Docker)

Requires Docker Desktop.

```sh
docker compose up -d --build   # start; open http://localhost:8080
docker compose down            # stop
```

The database lives in the `finance_data` Docker volume and survives both commands.
Backups (from M10 on) are written to `./backups`. Keep this folder, and the repo, outside
OneDrive or any other synced folder.

## Develop

Requires Node.js 26 (see `.nvmrc`) and pnpm 12 (`npm install -g pnpm`).

```sh
pnpm install
pnpm exec playwright install chromium   # once per machine
pnpm dev          # API on http://localhost:8080, web app with hot reload on http://localhost:5173
pnpm check:all    # format, lint, typecheck, tests, build, then Playwright
```

Coding agents: read [CLAUDE.md](CLAUDE.md) first.

## Private data

Real bank statements, databases (`*.sqlite`), `data/`, `backups/` and `Statement Samples/`
are git-ignored and must never be committed. Development and tests use synthetic data only.
