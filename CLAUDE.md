# Finance Tracker: agent instructions

## What this is

Local household finance tracker. Read docs/PLAN.md sections 1, 2 and your
milestone in section 5 before writing code. Read docs/STATUS.md for current state.

## Commands

```text
pnpm install        install
pnpm dev            server on 8080, web on 5173 with /api proxy
pnpm check          format, lint, typecheck, tests, build (run often)
pnpm check:all      check plus Playwright (must pass before you finish)
pnpm seed:demo      fill a dev database with synthetic data (added in M1)
```

Also useful: `pnpm format` (write Prettier fixes), `pnpm e2e` (Playwright only; needs
`pnpm build` first), `E2E_BASE_URL=http://localhost:8080 pnpm e2e` (run the specs
against an already running app, such as the Docker container).

First time on a machine: `pnpm exec playwright install chromium`.

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
  (Exception: shadcn/ui files under apps/web/src/components/ui stay as its CLI generates them.)
- Database columns snake_case, TypeScript and JSON camelCase.
- No new dependency without a line in docs/DECISIONS.md.
- Never weaken, skip, or delete a test to make checks pass.

## Data safety

- Use only fixtures/csv and pnpm seed:demo. Never read or commit real
  statements, \*.sqlite files, or anything under data/ or backups/.

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
