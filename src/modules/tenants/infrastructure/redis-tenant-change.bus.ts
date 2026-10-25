import { Inject, Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { AppConfig } from '../../../shared/config/app-config.js';
import { createRedisConnection, REDIS } from '../../../shared/redis/redis.connection.js';
import { TenantChangeBus, type TenantChangeEvent } from '../application/ports/tenant-change.bus.js';

const CHANNEL = 'tenants:changed';

/**
 * Change notices over Redis pub/sub. Every process (including the sender) receives each notice.
 * Subscribing needs its own connection; it is opened on the first `subscribe`.
 */
@Injectable()
export class RedisTenantChangeBus extends TenantChangeBus implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisTenantChangeBus.name);
  private readonly listeners: ((event: TenantChangeEvent) => void)[] = [];
  private subscriber?: Redis;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {
    super();
  }

  async publish(event: TenantChangeEvent): Promise<void> {
    try {
      await this.redis.publish(CHANNEL, JSON.stringify(event));
    } catch (error) {
      this.logger.warn(
        `Could not announce ${event.kind} change of ${event.tenantId}; other processes see it ` +
          `when their caches expire: ${(error as Error).message}`,
      );
    }
  }

  subscribe(listener: (event: TenantChangeEvent) => void): void {
    this.listeners.push(listener);
    if (this.subscriber) return;

    this.subscriber = createRedisConnection(this.config.env.REDIS_URL);
    this.subscriber.on('message', (_channel: string, message: string) => {
      const event = parseEvent(message);
      if (!event) return this.logger.warn(`Ignored malformed message on ${CHANNEL}`);
      for (const notify of this.listeners) notify(event);
    });
    this.subscriber
      .subscribe(CHANNEL)
      .catch((error: Error) =>
        this.logger.error(`Cannot subscribe to ${CHANNEL}: ${error.message}`),
      );
  }

  async onApplicationShutdown(): Promise<void> {
    await this.subscriber?.quit();
  }
}

function parseEvent(message: string): TenantChangeEvent | null {
  try {
    const value = JSON.parse(message) as Partial<TenantChangeEvent>;
    if ((value.kind === 'secrets' || value.kind === 'config') && typeof value.tenantId === 'string')
      return { kind: value.kind, tenantId: value.tenantId };
  } catch {
    // fall through
  }
  return null;
}
