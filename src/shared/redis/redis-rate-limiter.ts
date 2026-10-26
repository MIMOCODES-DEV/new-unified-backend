import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { REDIS } from './redis.connection.js';

/** Counts a call and starts the window on the first one, in one step. Returns [count, ms left]. */
const TAKE_SCRIPT = `
local count = redis.call('incr', KEYS[1])
if count == 1 then redis.call('pexpire', KEYS[1], ARGV[1]) end
return { count, redis.call('pttl', KEYS[1]) }`;

export interface RateLimit {
  /** Calls allowed per window. */
  limit: number;
  windowMs: number;
}

export interface RateDecision {
  allowed: boolean;
  /** When the caller may try again; 0 when allowed. */
  retryAfterMs: number;
}

/**
 * Fixed-window rate limits in Redis, shared by every server. Fails open: with Redis down, calls
 * are allowed (and logged), because a rate limit must never take a feature down (PLAN §5).
 */
@Injectable()
export class RedisRateLimiter {
  private readonly logger = new Logger(RedisRateLimiter.name);

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async take(key: string, limit: RateLimit): Promise<RateDecision> {
    if (this.redis.status !== 'ready') {
      this.logger.warn(`Rate limit skipped, Redis is ${this.redis.status}: ${key}`);
      return { allowed: true, retryAfterMs: 0 };
    }
    try {
      const [count, ttl] = (await this.redis.eval(TAKE_SCRIPT, 1, key, limit.windowMs)) as [
        number,
        number,
      ];
      return count <= limit.limit
        ? { allowed: true, retryAfterMs: 0 }
        : { allowed: false, retryAfterMs: Math.max(ttl, 0) };
    } catch (error) {
      this.logger.warn(`Rate limit skipped: ${(error as Error).message}`);
      return { allowed: true, retryAfterMs: 0 };
    }
  }
}
