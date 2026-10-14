import { Injectable } from '@nestjs/common';
import type { Db } from 'mongodb';
import { AppConfig } from '../config/app-config.js';
import { MongoClientPool } from './mongo-client.pool.js';

export interface TenantDbLocation {
  /** Cluster URI. Omitted when the tenant DB lives on the central cluster. */
  uri?: string;
  dbName: string;
}

/**
 * Hands out tenant databases. Repositories obtain their tenant `Db` through this registry
 * (via the tenant context, task TEN-03) — no module opens connections itself.
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
}
