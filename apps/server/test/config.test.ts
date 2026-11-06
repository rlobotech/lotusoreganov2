import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';

const base = { DATABASE_URL: 'postgres://x' } as NodeJS.ProcessEnv;

describe('loadConfig', () => {
  it('uses safe defaults in development', () => {
    const c = loadConfig({ ...base });
    expect(c.timeScale).toBe(1);
    expect(c.cookieSecure).toBe(false);
  });

  it('refuses TIME_SCALE != 1 in production', () => {
    expect(() =>
      loadConfig({
        ...base,
        NODE_ENV: 'production',
        TIME_SCALE: '60',
        ALLOWED_ORIGIN: 'https://x.example',
      }),
    ).toThrow(/TIME_SCALE/);
  });

  it('requires ALLOWED_ORIGIN in production', () => {
    expect(() => loadConfig({ ...base, NODE_ENV: 'production' })).toThrow(/ALLOWED_ORIGIN/);
  });

  it('allows TIME_SCALE in development', () => {
    expect(loadConfig({ ...base, TIME_SCALE: '60' }).timeScale).toBe(60);
  });
});
