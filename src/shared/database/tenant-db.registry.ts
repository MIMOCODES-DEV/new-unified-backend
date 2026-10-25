import { Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { AppConfig } from '../config/app-config.js';
import { MongoClientPool } from './mongo-client.pool.js';

export interface TenantDbLocation {
  /** Cluster URI. Omitted when the tenant DB lives on the central cluster. */
  uri?: string;
  dbName: string;
}

/** A client unused for this long is closed; the next request for its brand reconnects. */
const MAX_IDLE_MS = 10 * 60_000;

/**
 * Hands out tenant databases. Repositories use TenantDb (shared/tenancy), which calls this with the
 * current brand — no module opens connections itself. Connections are pooled per cluster URI
 * (lazy, shared while connecting, dropped on failure, closed when idle); a `Db` handle is cheap
 * and not cached.
 */
@Injectable()
export class TenantDbRegistry {
  constructor(
    private readonly pool: MongoClientPool,
    private readonly config: AppConfig,
  ) {}

  async getDb(location: TenantDbLocation): Promise<Db> {
    const client = await this.pool.get(location.uri ?? this.config.env.MONGO_URI);
    return client.db(location.dbName);
  }

  /** Closes connections to clusters no brand used recently. The central cluster always stays open. */
  closeIdle(): Promise<number> {
    return this.pool.closeIdle(MAX_IDLE_MS, new Set([this.config.env.MONGO_URI]));
  }

  /** Whether every open cluster connection answers a ping. */
  async isHealthy(): Promise<boolean> {
    return (await this.pool.health()).down === 0;
  }
}
