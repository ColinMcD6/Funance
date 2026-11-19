import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          root: './packages/shared',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'core',
          root: './packages/core',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        test: {
          name: 'server',
          root: './apps/server',
          include: ['src/**/*.test.ts'],
        },
      },
      // The web project reuses apps/web/vite.config.ts for its alias and plugins.
      './apps/web/vitest.config.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**', 'apps/*/src/**'],
      exclude: ['**/*.test.{ts,tsx}', '**/index.ts', 'apps/web/src/main.tsx'],
      reporter: ['text-summary', 'html'],
      thresholds: {
        // PLAN.md section 6: 90% line coverage enforced on the pure core library.
        'packages/core/src/**': { lines: 90 },
      },
    },
  },
});
