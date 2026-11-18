import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

const PORT = 8090;
// Set E2E_BASE_URL (e.g. http://localhost:8080) to test an already running app,
// such as the Docker container, instead of starting the built server.
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: externalBaseUrl ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } } },
  ],
  // Runs the production build (pnpm build must have run first, as pnpm check:all does)
  // on a fresh, empty database in the OS temp folder.
  webServer:
    externalBaseUrl === undefined
      ? {
          command: 'node apps/server/dist/index.js',
          url: `http://localhost:${PORT}/api/health`,
          reuseExistingServer: false,
          timeout: 30_000,
          env: {
            PORT: String(PORT),
            HOST: '127.0.0.1',
            DATABASE_PATH: join(mkdtempSync(join(tmpdir(), 'funance-e2e-')), 'e2e.sqlite'),
          },
        }
      : undefined,
});
