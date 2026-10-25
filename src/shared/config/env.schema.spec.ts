import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.schema.js';

const valid = {
  MONGO_URI: 'mongodb://localhost:27017',
  REDIS_URL: 'redis://localhost:6379',
};

describe('parseEnv', () => {
  it('applies defaults', () => {
    const env = parseEnv(valid);

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      MONGO_CENTRAL_DB: 'unified_central',
    });
  });

  it('coerces the port', () => {
    expect(parseEnv({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('fails fast on missing required values', () => {
    expect(() => parseEnv({ REDIS_URL: valid.REDIS_URL })).toThrow(/MONGO_URI/);
  });

  it('rejects a non-mongo URI', () => {
    expect(() => parseEnv({ ...valid, MONGO_URI: 'http://example.com' })).toThrow(/MONGO_URI/);
  });
});
