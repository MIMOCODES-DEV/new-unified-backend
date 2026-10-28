import { setTimeout as sleep } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisRateLimiter } from '../../src/shared/redis/redis-rate-limiter.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

describe('RedisRateLimiter on Redis', () => {
  let infra: TestInfrastructure;
  let redis: Redis;
  let limiter: RedisRateLimiter;

  beforeAll(async () => {
    infra = await startInfrastructure();
    redis = new Redis(infra.redisUrl);
    await redis.ping();
    limiter = new RedisRateLimiter(redis);
  });

  afterAll(async () => {
    await redis?.quit();
    await infra?.stop();
  });

  it('allows the limit, refuses the next call with the time left, then opens again', async () => {
    const limit = { limit: 3, windowMs: 300 };
    const key = `t:rate:${Date.now()}`;

    const first = await Promise.all([1, 2, 3, 4].map(() => limiter.take(key, limit)));
    await sleep(350);
    const later = await limiter.take(key, limit);

    expect(first.filter((d) => d.allowed)).toHaveLength(3);
    const refused = first.find((d) => !d.allowed);
    expect(refused?.retryAfterMs).toBeGreaterThan(0);
    expect(refused?.retryAfterMs).toBeLessThanOrEqual(300);
    expect(later.allowed).toBe(true);
  });

  it('keeps keys apart', async () => {
    const limit = { limit: 1, windowMs: 5_000 };
    const stamp = Date.now();

    await limiter.take(`t:rate:a:${stamp}`, limit);
    const other = await limiter.take(`t:rate:b:${stamp}`, limit);

    expect(other.allowed).toBe(true);
  });

  it('fails open when Redis is not connected', async () => {
    const closed = new Redis(infra.redisUrl, { lazyConnect: true });

    const decision = await new RedisRateLimiter(closed).take('t:rate:closed', {
      limit: 1,
      windowMs: 1_000,
    });

    expect(decision.allowed).toBe(true);
    closed.disconnect();
  });
});
