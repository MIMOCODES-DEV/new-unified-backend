import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { LicenseRepository } from '../application/ports/license.repository.js';
import type { License } from '../domain/license.js';
import {
  LICENSES_COLLECTION,
  toLicense,
  toLicenseDocument,
  type LicenseDocument,
} from './license.document.js';

/** licenses in the current brand's database. The collection is looked up on every call. */
@Injectable()
export class MongoLicenseRepository extends LicenseRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<LicenseDocument>> {
    return this.tenantDb.collection<LicenseDocument>(LICENSES_COLLECTION);
  }

  async findById(id: string): Promise<License | null> {
    const doc = await (await this.collection()).findOne({ _id: id });
    return doc ? toLicense(doc) : null;
  }

  async listByDevice(deviceId: string): Promise<License[]> {
    const docs = await (
      await this.collection()
    )
      .find({ deviceId })
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map(toLicense);
  }

  async findBySource(deviceId: string, sourceId: string): Promise<License | null> {
    const doc = await (await this.collection()).findOne({ deviceId, sourceId });
    return doc ? toLicense(doc) : null;
  }

  async insert(license: License): Promise<void> {
    await (await this.collection()).insertOne(toLicenseDocument(license));
  }

  async update(license: License): Promise<boolean> {
    const doc = toLicenseDocument(license);
    return (await (await this.collection()).replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    return (await (await this.collection()).deleteOne({ _id: id })).deletedCount > 0;
  }
}
