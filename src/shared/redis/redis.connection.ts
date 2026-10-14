import { Logger } from '@nestjs/common';
import { Redis, type RedisOptions } from 'ioredis';

/** Shared Redis client (cache, rate limits, locks). Type: `Redis` from `ioredis`. */
export const REDIS = Symbol('REDIS');

const logger = new Logger('Redis');

export function createRedisConnection(url: string, options: RedisOptions = {}): Redis {
  const redis = new Redis(url, { connectionName: 'unified-backend', ...options });
  // ioredis reconnects on its own; without a listener every failed attempt is an "unhandled error event".
  let lastMessage = '';
  redis.on('error', (error: Error) => {
    if (error.message !== lastMessage) {
      logger.error(error.message);
      lastMessage = error.message;
    }
  });
  redis.on('ready', () => {
    lastMessage = '';
  });
  return redis;
}
