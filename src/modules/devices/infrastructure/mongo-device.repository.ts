import { Injectable } from '@nestjs/common';
import { type Collection, MongoServerError } from 'mongodb';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import {
  DeviceRepository,
  type InsertResult,
  type MoveResult,
} from '../application/ports/device.repository.js';
import { AppType } from '../domain/app-type.js';
import { AppDeviceId, AppUid } from '../domain/device-identity.js';
import { Device } from '../domain/device.entity.js';
import { Uid } from '../domain/uid.js';

export const PENDING_DEVICES_COLLECTION = 'pendingDevices';
export const DEVICES_COLLECTION = 'devices';

const DUPLICATE_KEY = 11000;

/** Stored shape in both collections; `devices` documents also carry `activatedAt`. */
interface DeviceDocument {
  _id: string;
  macAddress: string;
  appType: string;
  deviceKey: string;
  trialExpiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date;
  activatedAt?: Date;
  uid?: string;
  v4Verified?: boolean;
  appDeviceId?: string;
  appUid?: string;
}

/**
 * Devices of the current brand, in its own database. Collections are fetched on every call:
 * this object is created once, but each request may be for a different brand.
 */
@Injectable()
export class MongoDeviceRepository extends DeviceRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  async findPaidByMac(mac: MacAddress): Promise<Device | null> {
    const doc = await (await this.paid()).findOne({ macAddress: mac.value });
    return doc ? this.toEntity(doc, 'paid') : null;
  }

  async findPendingByMac(mac: MacAddress): Promise<Device | null> {
    const doc = await (await this.pending()).findOne({ macAddress: mac.value });
    return doc ? this.toEntity(doc, 'pending') : null;
  }

  async findPaidByAppDeviceId(id: AppDeviceId): Promise<Device | null> {
    const doc = await (await this.paid()).findOne({ appDeviceId: id.value });
    return doc ? this.toEntity(doc, 'paid') : null;
  }

  async findPendingByAppDeviceId(id: AppDeviceId): Promise<Device | null> {
    const doc = await (await this.pending()).findOne({ appDeviceId: id.value });
    return doc ? this.toEntity(doc, 'pending') : null;
  }

  async insertPending(device: Device): Promise<InsertResult> {
    // Keys of paid devices are no longer in pendingDevices, so its unique index can't see them.
    if (await this.isPaidKey(device.deviceKey)) return 'key_taken';
    const pending = await this.pending();
    try {
      await pending.insertOne(this.toDocument(device));
    } catch (error) {
      const duplicate = this.duplicateField(error);
      if (duplicate === 'macAddress') return 'mac_taken';
      if (duplicate === 'deviceKey') return 'key_taken';
      if (duplicate === 'appDeviceId') return 'app_device_id_taken';
      throw error;
    }
    // A device holding this key may have moved into devices while we inserted. Keeping both would
    // make that key exist twice and block this device's own activation later, so back out.
    if (await this.isPaidKey(device.deviceKey)) {
      await pending.deleteOne({ _id: device.id });
      return 'key_taken';
    }
    return 'inserted';
  }

  private async isPaidKey(deviceKey: string): Promise<boolean> {
    const found = await (await this.paid()).findOne({ deviceKey }, { projection: { _id: 1 } });
    return found !== null;
  }

  async touch(device: Device): Promise<void> {
    const collection = device.isPaid ? await this.paid() : await this.pending();
    await collection.updateOne(
      { _id: device.id },
      {
        $set: {
          lastSeenAt: device.lastSeenAt,
          v4Verified: device.v4Verified,
          ...(device.uid ? { uid: device.uid.value } : {}),
          ...(device.appUid ? { appUid: device.appUid.value } : {}),
          updatedAt: new Date(),
        },
      },
    );
  }

  async moveToPaid(device: Device): Promise<MoveResult> {
    const db = await this.tenantDb.db();
    const pending = db.collection<DeviceDocument>(PENDING_DEVICES_COLLECTION);
    const paid = db.collection<DeviceDocument>(DEVICES_COLLECTION);

    return db.client.withSession(async (session) => {
      let result: MoveResult = 'moved';
      await session.withTransaction(async () => {
        result = 'moved';
        const removed = await pending.deleteOne({ _id: device.id }, { session });
        if (removed.deletedCount === 0) {
          result = 'not_pending';
          await session.abortTransaction();
          return;
        }
        try {
          await paid.insertOne(this.toDocument(device), { session });
        } catch (error) {
          const duplicate = this.duplicateField(error);
          if (duplicate !== 'macAddress' && duplicate !== 'appDeviceId') throw error;
          result = 'not_pending';
          await session.abortTransaction();
        }
      });
      return result;
    });
  }

  private pending(): Promise<Collection<DeviceDocument>> {
    return this.tenantDb.collection<DeviceDocument>(PENDING_DEVICES_COLLECTION);
  }

  private paid(): Promise<Collection<DeviceDocument>> {
    return this.tenantDb.collection<DeviceDocument>(DEVICES_COLLECTION);
  }

  private duplicateField(error: unknown): string | undefined {
    if (!(error instanceof MongoServerError) || error.code !== DUPLICATE_KEY) return undefined;
    const pattern = (error as MongoServerError & { keyPattern?: Record<string, unknown> })
      .keyPattern;
    return pattern ? Object.keys(pattern)[0] : undefined;
  }

  private toDocument(device: Device): DeviceDocument {
    const now = new Date();
    return {
      _id: device.id,
      macAddress: device.macAddress.value,
      appType: device.appType.value,
      deviceKey: device.deviceKey,
      trialExpiresAt: device.trialExpiresAt,
      createdAt: device.createdAt,
      updatedAt: now,
      lastSeenAt: device.lastSeenAt,
      ...(device.activatedAt ? { activatedAt: device.activatedAt } : {}),
      ...(device.uid ? { uid: device.uid.value } : {}),
      ...(device.appDeviceId ? { appDeviceId: device.appDeviceId.value } : {}),
      ...(device.appUid ? { appUid: device.appUid.value } : {}),
      v4Verified: device.v4Verified,
    };
  }

  private toEntity(doc: DeviceDocument, state: 'pending' | 'paid'): Device {
    // Stored values were validated on write; a bad one here means the data was edited by hand.
    const mac = MacAddress.parse(doc.macAddress);
    if (!mac.ok) throw mac.error;
    const appType = AppType.parse(doc.appType);
    if (!appType.ok) throw appType.error;
    return Device.restore({
      id: doc._id,
      macAddress: mac.value,
      appType: appType.value,
      deviceKey: doc.deviceKey,
      state,
      trialExpiresAt: doc.trialExpiresAt,
      createdAt: doc.createdAt,
      lastSeenAt: doc.lastSeenAt,
      activatedAt: doc.activatedAt ?? null,
      appDeviceId: this.toAppDeviceId(doc.appDeviceId),
      appUid: this.toAppUid(doc.appUid),
      uid: this.toUid(doc.uid),
      v4Verified: doc.v4Verified ?? false,
    });
  }

  private toAppDeviceId(stored: string | undefined): AppDeviceId | null {
    if (stored === undefined) return null;
    const id = AppDeviceId.parse(stored);
    return id.ok ? id.value : null;
  }

  private toAppUid(stored: string | undefined): AppUid | null {
    if (stored === undefined) return null;
    const uid = AppUid.parse(stored);
    return uid.ok ? uid.value : null;
  }

  private toUid(stored: string | undefined): Uid | null {
    if (stored === undefined) return null;
    const uid = Uid.parse(stored);
    return uid.ok ? uid.value : null; // an unreadable stored u_id is treated as missing
  }
}
