// Bundles the server (and the workspace packages it imports) into dist/index.js.
// better-sqlite3 is native, so it stays external and is loaded from node_modules.
// The SQL migrations are copied to dist/migrations, where migrate.ts looks for them.
import { cpSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

rmSync('dist', { recursive: true, force: true });

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node26',
  sourcemap: true,
  external: ['better-sqlite3'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: 'info',
});

// The SQL migrations run at start, from dist/migrations next to the bundle.
cpSync('src/db/migrations', 'dist/migrations', { recursive: true });
