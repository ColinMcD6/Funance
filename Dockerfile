# syntax=docker/dockerfile:1

# ---- base: Node (pinned to match .nvmrc) with pnpm ----
FROM node:26-bookworm-slim AS base
RUN npm install -g pnpm@12.21.0
WORKDIR /app

# ---- build: install everything, build web and server, then prune to server prod deps ----
FROM base AS build
# Toolchain for better-sqlite3 in case no prebuilt binary matches this Node version.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/core/package.json packages/core/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN pnpm --filter @funance/server deploy --prod --legacy /out

# ---- runtime: only the bundled server, its native deps, and the built web app ----
FROM node:26-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/finance.sqlite \
    BACKUP_DIR=/backups
WORKDIR /app
COPY --from=build /out/node_modules apps/server/node_modules
COPY --from=build /app/apps/server/package.json apps/server/package.json
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir -p /data /backups && chown node:node /data /backups
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "apps/server/dist/index.js"]
