import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readConfig } from './config.js';

describe('readConfig', () => {
  it('uses defaults when nothing is set', () => {
    const config = readConfig({});
    expect(config.port).toBe(8080);
    expect(config.host).toBe('0.0.0.0');
    expect(config.databasePath).toBe(resolve('data/finance.sqlite'));
    expect(config.staticDir).toBe(resolve(import.meta.dirname, '../../web/dist'));
  });

  it('reads PORT, DATABASE_PATH, HOST and STATIC_DIR', () => {
    const config = readConfig({
      PORT: '9090',
      DATABASE_PATH: '/data/finance.sqlite',
      HOST: '127.0.0.1',
      STATIC_DIR: '/srv/web',
    });
    expect(config).toEqual({
      port: 9090,
      host: '127.0.0.1',
      databasePath: resolve('/data/finance.sqlite'),
      staticDir: resolve('/srv/web'),
    });
  });

  it.each(['abc', '0', '70000', '80.5'])('rejects PORT=%s', (port) => {
    expect(() => readConfig({ PORT: port })).toThrow(/PORT/);
  });
});
