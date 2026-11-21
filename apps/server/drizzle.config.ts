import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @funance/server db:generate` writes a new SQL migration after a schema change.
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
});
