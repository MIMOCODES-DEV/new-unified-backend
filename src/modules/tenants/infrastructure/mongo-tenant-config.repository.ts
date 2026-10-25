import { Injectable } from '@nestjs/common';
import { TenantDbRegistry } from '../../../shared/database/tenant-db.registry.js';
import {
  TenantConfigRepository,
  type TenantDbRef,
} from '../application/ports/tenant-config.repository.js';

export const TENANT_CONFIG_COLLECTION = 'tenantConfig';
/** The collection holds exactly one document. */
const CONFIG_ID = 'config';

interface TenantConfigDocument {
  _id: string;
  updatedAt: Date;
  [key: string]: unknown;
}

/** `tenantConfig` lives in each brand's own database, next to the data it configures. */
@Injectable()
export class MongoTenantConfigRepository extends TenantConfigRepository {
  constructor(private readonly registry: TenantDbRegistry) {
    super();
  }

  async load(tenant: TenantDbRef): Promise<unknown> {
    const doc = await (
      await this.collection(tenant)
    ).findOne({ _id: CONFIG_ID }, { projection: { _id: 0, updatedAt: 0 } });
    return doc ?? null;
  }

  async save(tenant: TenantDbRef, config: object, now: Date): Promise<void> {
    await (
      await this.collection(tenant)
    ).replaceOne({ _id: CONFIG_ID }, { ...config, updatedAt: now }, { upsert: true });
  }

  private async collection(tenant: TenantDbRef) {
    return (await this.registry.getDb({ dbName: tenant.dbName })).collection<TenantConfigDocument>(
      TENANT_CONFIG_COLLECTION,
    );
  }
}
