import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/lib/config.js';

describe('TECH-01: loadConfig', () => {
  it('uses local-dev defaults when the environment is empty', () => {
    const config = loadConfig({});
    expect(config.port).toBe(3001);
    expect(config.databaseUrl).toContain('/wayfarer');
    expect(config.testDatabaseUrl).toContain('/wayfarer_test');
    expect(config.cookieSecure).toBe(false);
  });

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      PORT: '4000',
      DATABASE_URL: 'postgres://x/y',
      JWT_SECRET: 's3cret',
    });
    expect(config.port).toBe(4000);
    expect(config.databaseUrl).toBe('postgres://x/y');
    expect(config.jwtSecret).toBe('s3cret');
  });

  it.each(['abc', '0', '70000', '12.5'])('rejects invalid PORT %s', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/Invalid PORT/);
  });
});

describe('SCRUM-34: session secret configuration', () => {
  it('refuses to start in production without JWT_SECRET', () => {
    expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
  });

  it('uses secure cookies in production', () => {
    const config = loadConfig({ NODE_ENV: 'production', JWT_SECRET: 'x' });
    expect(config.cookieSecure).toBe(true);
  });
});
