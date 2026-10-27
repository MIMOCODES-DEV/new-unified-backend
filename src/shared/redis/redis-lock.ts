import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.connection.js';

/** Deletes the key only while it still holds our token, so a late release never frees someone else's lock. */
const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;
const RETRY_MS = 25;

/** Another caller held the lock for longer than we were willing to wait. */
export class LockBusyError extends Error {
  constructor(readonly key: string) {
    super(`Lock is held by another caller: ${key}`);
    this.name = 'LockBusyError';
  }
}

/** Redis cannot be reached, so the work is refused instead of running unprotected. */
export class LockUnavailableError extends Error {
  constructor(
    readonly key: string,
    options?: { cause: unknown },
  ) {
    super(`Redis is unavailable; locked work is refused: ${key}`, options);
    this.name = 'LockUnavailableError';
  }
}

export interface LockOptions {
  /** The lock frees itself after this long, even if its holder dies. */
  ttlMs: number;
  /** How long to keep trying while someone else holds the lock. Default: do not wait. */
  waitMs?: number;
}

/**
 * Makes sure only one caller, on any server, runs the work for a key at a time
 * (one device's MAC, one activation, …). Fails closed: without Redis the work does not run.
 */
@Injectable()
export class RedisLock {
  private readonly logger = new Logger(RedisLock.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async withLock<T>(key: string, options: LockOptions, fn: () => Promise<T>): Promise<T> {
    const token = randomUUID();
    await this.acquire(key, token, options);
    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }

  private async acquire(key: string, token: string, options: LockOptions): Promise<void> {
    const deadline = Date.now() + (options.waitMs ?? 0);
    for (;;) {
      // Commands sent while disconnected would sit in ioredis' offline queue; refuse instead.
      if (this.redis.status !== 'ready') throw new LockUnavailableError(key);
      let taken: string | null;
      try {
        taken = await this.redis.set(key, token, 'PX', options.ttlMs, 'NX');
      } catch (cause) {
        throw new LockUnavailableError(key, { cause });
      }
      if (taken === 'OK') return;
      if (Date.now() >= deadline) throw new LockBusyError(key);
      await sleep(RETRY_MS);
    }
  }

  private async release(key: string, token: string): Promise<void> {
    try {
      await this.redis.eval(RELEASE_SCRIPT, 1, key, token);
    } catch (error) {
      // The lock still expires on its own after its TTL; the work itself already finished.
      this.logger.warn(`Could not release lock ${key}: ${(error as Error).message}`);
    }
  }
}
