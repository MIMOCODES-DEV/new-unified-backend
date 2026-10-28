import { Injectable } from '@nestjs/common';
import type { Collection, Filter } from 'mongodb';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { TrialDeviceRepository } from '../application/ports/trial-device.repository.js';
import type { DeviceSettingsChange, DeviceVisit, TrialDevice } from '../domain/device.js';
import {
  TRIAL_DEVICES_COLLECTION,
  toTrialDevice,
  toTrialDeviceDocument,
  type TrialDeviceDocument,
} from './device.document.js';

/** trialDevices in the current brand's database. The collection is looked up on every call. */
@Injectable()
export class MongoTrialDeviceRepository extends TrialDeviceRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<TrialDeviceDocument>> {
    return this.tenantDb.collection<TrialDeviceDocument>(TRIAL_DEVICES_COLLECTION);
  }

  private async findOne(filter: Filter<TrialDeviceDocument>): Promise<TrialDevice | null> {
    const doc = await (await this.collection()).findOne(filter);
    return doc ? toTrialDevice(doc) : null;
  }

  findById(id: string): Promise<TrialDevice | null> {
    return this.findOne({ _id: id });
  }

  findByMac(mac: MacAddress): Promise<TrialDevice | null> {
    return this.findOne({ macAddress: mac.value });
  }

  findByAppDeviceId(appDeviceId: string): Promise<TrialDevice | null> {
    return this.findOne({ appDeviceId });
  }

  findByUid(uid: string): Promise<TrialDevice | null> {
    return this.findOne({ uid });
  }

  findByLegacyId(legacyId: string): Promise<TrialDevice | null> {
    return this.findOne({ 'legacy.id': legacyId });
  }

  async insert(device: TrialDevice): Promise<void> {
    await (await this.collection()).insertOne(toTrialDeviceDocument(device));
  }

  async recordVisit(id: string, visit: DeviceVisit): Promise<boolean> {
    const result = await (
      await this.collection()
    ).updateOne(
      { _id: id },
      {
        $set: {
          platform: visit.platform,
          ip: visit.ip,
          appVersion: visit.appVersion,
          apiVersion: visit.apiVersion,
          lastSeenAt: visit.at,
          updatedAt: visit.at,
        },
      },
    );
    return result.matchedCount > 0;
  }

  async changeSettings(id: string, change: DeviceSettingsChange): Promise<boolean> {
    const result = await (await this.collection()).updateOne({ _id: id }, { $set: { ...change } });
    return result.matchedCount > 0;
  }

  async update(device: TrialDevice): Promise<boolean> {
    const doc = toTrialDeviceDocument(device);
    return (await (await this.collection()).replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }

  async changePlaylistCount(id: string, delta: number, at: Date): Promise<boolean> {
    // One pipeline update, so two playlists added at once both count.
    const result = await (
      await this.collection()
    ).updateOne({ _id: id }, [
      {
        $set: {
          playlistCount: { $max: [0, { $add: ['$playlistCount', delta] }] },
          firstPlaylistAt: delta > 0 ? { $ifNull: ['$firstPlaylistAt', at] } : '$firstPlaylistAt',
          updatedAt: at,
        },
      },
    ]);
    return result.matchedCount > 0;
  }

  async listStale(endedBefore: Date, notSeenSince: Date, limit: number): Promise<TrialDevice[]> {
    const docs = await (
      await this.collection()
    )
      .find({
        trialEndsAt: { $lt: endedBefore },
        playlistCount: 0,
        lastSeenAt: { $lt: notSeenSince },
      })
      .sort({ trialEndsAt: 1 })
      .limit(limit)
      .toArray();
    return docs.map(toTrialDevice);
  }

  async delete(id: string): Promise<boolean> {
    return (await (await this.collection()).deleteOne({ _id: id })).deletedCount > 0;
  }
}
