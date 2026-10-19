/**
 * Mongo rules for devices:
 * - Stored in the current brand's database (TenantDb), collection "devices".
 * - camelCase fields, real Dates; the license is one sub-document.
 * - The MAC is unique per brand (index in devices.migrations.ts), so a duplicate insert fails
 *   with code 11000 instead of creating a second record.
 */
import { Injectable } from '@nestjs/common';
import { type Collection, MongoServerError } from 'mongodb';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { DeviceRepository } from '../application/ports/device.repository.js';
import type { AppType } from '../domain/app-type.js';
import { Device, type DeviceState } from '../domain/device.entity.js';
import { License, type LicenseType } from '../domain/license.js';

export const DEVICES_COLLECTION = 'devices';
const DUPLICATE_KEY = 11000;

/** Stored shape of a device. */
interface DeviceDocument {
  _id: string;
  macAddress: string;
  appType: AppType;
  deviceKey: string;
  uid?: string;
  state: DeviceState;
  license: { type: LicenseType; expiresAt: Date | null; revoked: boolean };
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class MongoDeviceRepository extends DeviceRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  // Fetched on every call: this object is created once, each request may be for another brand.
  private collection(): Promise<Collection<DeviceDocument>> {
    return this.tenantDb.collection<DeviceDocument>(DEVICES_COLLECTION);
  }

  async findByMac(mac: MacAddress): Promise<Device | null> {
    const doc = await (await this.collection()).findOne({ macAddress: mac.value });
    return doc ? toEntity(doc) : null;
  }

  async save(device: Device): Promise<void> {
    // createdAt is rewritten with its own value: it never changes.
    const { _id, ...fields } = toDocument(device);
    await (await this.collection()).updateOne({ _id }, { $set: fields });
  }

  async insert(device: Device): Promise<boolean> {
    try {
      await (await this.collection()).insertOne(toDocument(device));
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === DUPLICATE_KEY) return false;
      throw error;
    }
  }
}

function toDocument(device: Device): DeviceDocument {
  return {
    _id: device.id,
    macAddress: device.mac.value,
    appType: device.appType,
    deviceKey: device.deviceKey,
    ...(device.uid ? { uid: device.uid } : {}),
    state: device.state,
    license: {
      type: device.license.type,
      expiresAt: device.license.expiresAt,
      revoked: device.license.revoked,
    },
    createdAt: device.createdAt,
    updatedAt: new Date(),
  };
}

function toEntity(doc: DeviceDocument): Device {
  // Stored MACs were normalized on save; a bad one means the data was edited by hand.
  const mac = MacAddress.parse(doc.macAddress);
  if (!mac.ok) throw mac.error;
  return Device.restore({
    id: doc._id,
    mac: mac.value,
    appType: doc.appType,
    deviceKey: doc.deviceKey,
    uid: doc.uid ?? null,
    state: doc.state,
    license: License.restore(doc.license),
    createdAt: doc.createdAt,
  });
}
