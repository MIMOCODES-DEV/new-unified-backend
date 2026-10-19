import { Injectable } from '@nestjs/common';
import type { Collection, Db, Document } from 'mongodb';
import { TenantDbRegistry } from '../database/tenant-db.registry.js';
import { TenantContext } from './tenant-context.js';

/**
 * The current brand's database. Repositories of brand data (devices, playlists, …) inject this
 * instead of a `Db`, and ask for their collection on every call: a repository is created once,
 * but each request may be for a different brand.
 */
@Injectable()
export class TenantDb {
  constructor(
    private readonly context: TenantContext,
    private readonly registry: TenantDbRegistry,
  ) {}

  async db(): Promise<Db> {
    return this.registry.getDb({ dbName: this.context.current.dbName });
  }

  async collection<T extends Document>(name: string): Promise<Collection<T>> {
    return (await this.db()).collection<T>(name);
  }
}
