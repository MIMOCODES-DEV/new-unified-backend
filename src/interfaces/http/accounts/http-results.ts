import { HttpException, HttpStatus } from '@nestjs/common';
import { z } from 'zod';
import type { DomainError } from '../../../shared/kernel/domain-error.js';
import type { Result } from '../../../shared/kernel/result.js';
import type { RateLimit, RedisRateLimiter } from '../../../shared/redis/redis-rate-limiter.js';

/** An HTTP error with our body, `{ error: { code, message } }`. */
export const fail = (status: number, code: string, message: string) =>
  new HttpException({ error: { code, message } }, status);

/** The value, or the error as `{ error: { code, message } }` with its status (422 when unlisted). */
export function unwrap<T>(result: Result<T, DomainError>, statuses: Record<string, number>): T {
  if (result.ok) return result.value;
  const { code, message } = result.error;
  throw fail(statuses[code] ?? HttpStatus.UNPROCESSABLE_ENTITY, code, message);
}

/** The request body or params checked against `schema`; 400 with the reasons otherwise. */
export function parse<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw fail(HttpStatus.BAD_REQUEST, 'invalid_request', z.prettifyError(parsed.error));
  }
  return parsed.data;
}

/** Counts one try against every key; 429 when any is over its limit. */
export async function limit(
  limiter: RedisRateLimiter,
  rule: RateLimit,
  ...keys: string[]
): Promise<void> {
  for (const key of keys) {
    const decision = await limiter.take(key, rule);
    if (!decision.allowed) {
      throw fail(
        HttpStatus.TOO_MANY_REQUESTS,
        'rate_limited',
        `Too many tries; try again in ${Math.ceil(decision.retryAfterMs / 1000)} seconds`,
      );
    }
  }
}

export const NOT_FOUND = HttpStatus.NOT_FOUND;
export const CONFLICT = HttpStatus.CONFLICT;
export const UNAUTHORIZED = HttpStatus.UNAUTHORIZED;
export const FORBIDDEN = HttpStatus.FORBIDDEN;
export const BAD_REQUEST = HttpStatus.BAD_REQUEST;
