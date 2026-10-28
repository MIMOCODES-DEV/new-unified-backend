import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../config/app-config.js';
import { createRedisConnection, REDIS } from './redis.connection.js';
import { RedisLock } from './redis-lock.js';
import { RedisRateLimiter } from './redis-rate-limiter.js';
import { RedisSessionStore } from './redis-session.store.js';
import { SessionStore } from '../auth/session-store.js';

@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [AppConfig],
      useFactory: (config: AppConfig) => createRedisConnection(config.env.REDIS_URL),
    },
    RedisLock,
    RedisRateLimiter,
    { provide: SessionStore, useClass: RedisSessionStore },
  ],
  exports: [REDIS, RedisLock, RedisRateLimiter, SessionStore],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown(): Promise<void> {
    await this.redis.quit();
  }
}
