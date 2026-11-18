import { resolve } from 'node:path';

export type ServerConfig = {
  port: number;
  host: string;
  databasePath: string;
  staticDir: string;
};

/** Where the built web app lives, relative to this file in both `src/` (dev) and `dist/` (build). */
const DEFAULT_STATIC_DIR = resolve(import.meta.dirname, '../../web/dist');

/** Reads server settings from environment variables, with defaults for local development. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const portText = env.PORT ?? '8080';
  const port = Number(portText);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535, got "${portText}"`);
  }
  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    databasePath: resolve(env.DATABASE_PATH ?? 'data/finance.sqlite'),
    staticDir: resolve(env.STATIC_DIR ?? DEFAULT_STATIC_DIR),
  };
}
