import { setTimeout as sleep } from 'node:timers/promises';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LockBusyError,
  LockUnavailableError,
  RedisLock,
} from '../../src/shared/redis/redis-lock.js';
import { startInfrastructure, type TestInfrastructure } from '../support/infrastructure.js';

describe('RedisLock on Redis', () => {
  let infra: TestInfrastructure;
  let redis: Redis;
  let lock: RedisLock;

  beforeAll(async () => {
    infra = await startInfrastructure();
    redis = new Redis(infra.redisUrl);
    await redis.ping();
    lock = new RedisLock(redis);
  });

  afterAll(async () => {
    await redis?.quit();
    await infra?.stop();
  });

  it('waits for a client that is still connecting instead of refusing', async () => {
    const fresh = new Redis(infra.redisUrl);
    try {
      expect(fresh.status).not.toBe('ready');

      await expect(
        new RedisLock(fresh).withLock('t:fresh', { ttlMs: 5_000 }, () => Promise.resolve('ran')),
      ).resolves.toBe('ran');
    } finally {
      await fresh.quit();
    }
  });

  it('refuses a second caller while the lock is held', async () => {
    let release!: () => void;
    const holding = lock.withLock(
      't:held',
      { ttlMs: 5_000 },
      () => new Promise<void>((r) => (release = r)),
    );
    await sleep(50);

    await expect(
      lock.withLock('t:held', { ttlMs: 5_000 }, () => Promise.resolve('second')),
    ).rejects.toBeInstanceOf(LockBusyError);
    release();
    await holding;
  });

  it('lets a waiting caller in once the holder is done', async () => {
    const order: string[] = [];
    const first = lock.withLock('t:wait', { ttlMs: 5_000 }, async () => {
      await sleep(100);
      order.push('first');
    });
    await sleep(10);
    const second = lock.withLock('t:wait', { ttlMs: 5_000, waitMs: 2_000 }, () => {
      order.push('second');
      return Promise.resolve();
    });

    await Promise.all([first, second]);
    expect(order).toEqual(['first', 'second']);
  });

  it('runs different keys in parallel', async () => {
    const started = Date.now();
    await Promise.all(
      ['t:a', 't:b', 't:c'].map((key) => lock.withLock(key, { ttlMs: 5_000 }, () => sleep(200))),
    );

    expect(Date.now() - started).toBeLessThan(550);
  });

  it('releases the lock when the work throws', async () => {
    await expect(
      lock.withLock('t:throw', { ttlMs: 5_000 }, () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    expect(await redis.exists('t:throw')).toBe(0);
  });

  it('expires after its TTL, and a late release never frees the next holder', async () => {
    const slow = lock.withLock('t:ttl', { ttlMs: 150 }, () => sleep(400));
    await sleep(250);
    // The first holder's TTL has passed: a new caller takes the lock.
    let secondHeld = false;
    const second = lock.withLock('t:ttl', { ttlMs: 5_000 }, async () => {
      secondHeld = true;
      await sleep(300);
      // The first holder has finished and tried to release by now; our lock must still be there.
      expect(await redis.exists('t:ttl')).toBe(1);
    });

    await Promise.all([slow, second]);
    expect(secondHeld).toBe(true);
  });

  it('fails closed when Redis is unavailable', async () => {
    const down = new Redis('redis://127.0.0.1:1', { lazyConnect: true, maxRetriesPerRequest: 0 });
    const offline = new RedisLock(down);
    let ran = false;

    await expect(
      offline.withLock('t:down', { ttlMs: 1_000 }, () => {
        ran = true;
        return Promise.resolve();
      }),
    ).rejects.toBeInstanceOf(LockUnavailableError);
    expect(ran).toBe(false);
    down.disconnect();
  });
});
