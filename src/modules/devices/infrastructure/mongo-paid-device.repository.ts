import { Injectable } from '@nestjs/common';
import type { Collection, Filter } from 'mongodb';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { PaidDeviceRepository } from '../application/ports/paid-device.repository.js';
import type { PaidDevice } from '../domain/device.js';
import {
  PAID_DEVICES_COLLECTION,
  toPaidDevice,
  toPaidDeviceDocument,
  type PaidDeviceDocument,
} from './device.document.js';

/** devices (paid at least once) in the current brand's database. Rows are never deleted. */
@Injectable()
export class MongoPaidDeviceRepository extends PaidDeviceRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<PaidDeviceDocument>> {
    return this.tenantDb.collection<PaidDeviceDocument>(PAID_DEVICES_COLLECTION);
  }

  private async findOne(filter: Filter<PaidDeviceDocument>): Promise<PaidDevice | null> {
    const doc = await (await this.collection()).findOne(filter);
    return doc ? toPaidDevice(doc) : null;
  }

  findById(id: string): Promise<PaidDevice | null> {
    return this.findOne({ _id: id });
  }

  findByMac(mac: MacAddress): Promise<PaidDevice | null> {
    return this.findOne({ macAddress: mac.value });
  }

  findByAppDeviceId(appDeviceId: string): Promise<PaidDevice | null> {
    return this.findOne({ appDeviceId });
  }

  findByUid(uid: string): Promise<PaidDevice | null> {
    return this.findOne({ uid });
  }

  findByLegacyId(legacyId: string): Promise<PaidDevice | null> {
    return this.findOne({ 'legacy.id': legacyId });
  }

  async insert(device: PaidDevice): Promise<void> {
    await (await this.collection()).insertOne(toPaidDeviceDocument(device));
  }

  async update(device: PaidDevice): Promise<boolean> {
    const doc = toPaidDeviceDocument(device);
    return (await (await this.collection()).replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }
}
