import { Injectable, Logger } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { DeviceSettings } from '../application/ports/device-settings.js';
import {
  DEFAULT_LEGACY_PROFILE,
  type LegacyProfile,
  parseLegacyProfile,
} from '../domain/legacy-profile.js';
import { TrialDays } from '../domain/trial-days.js';

/** One typed settings document per brand database (the first piece of tenantConfig, TEN-05). */
export const TENANT_CONFIG_COLLECTION = 'tenantConfig';
const CONFIG_ID = 'tenant';

interface TenantConfigDocument {
  _id: string;
  devices?: { trialDays?: unknown };
  legacy?: { profile?: unknown };
  updatedAt?: Date;
}

/** Device settings of the current brand, from `<brand db>.tenantConfig`. Read on every call (no cache yet). */
@Injectable()
export class MongoDeviceSettings extends DeviceSettings {
  private readonly logger = new Logger(MongoDeviceSettings.name);

  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  async trialDays(): Promise<TrialDays> {
    const doc = await (await this.config()).findOne({ _id: CONFIG_ID });
    const stored = doc?.devices?.trialDays;
    if (stored === undefined) return TrialDays.default();
    const parsed = TrialDays.parse(stored);
    if (parsed.ok) return parsed.value;
    // Edited by hand to something invalid: keep serving devices with the default rather than failing.
    this.logger.warn(
      `Invalid devices.trialDays ${JSON.stringify(stored)} in tenantConfig; using the default`,
    );
    return TrialDays.default();
  }

  async setTrialDays(days: TrialDays): Promise<void> {
    await (
      await this.config()
    ).updateOne(
      { _id: CONFIG_ID },
      { $set: { 'devices.trialDays': days.days, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  async legacyProfile(): Promise<LegacyProfile> {
    const doc = await (await this.config()).findOne({ _id: CONFIG_ID });
    const stored = doc?.legacy?.profile;
    if (stored === undefined) return DEFAULT_LEGACY_PROFILE;
    const parsed = parseLegacyProfile(stored);
    if (parsed.ok) return parsed.value;
    this.logger.warn(
      `Invalid legacy.profile ${JSON.stringify(stored)} in tenantConfig; using the default`,
    );
    return DEFAULT_LEGACY_PROFILE;
  }

  async setLegacyProfile(profile: LegacyProfile): Promise<void> {
    await (
      await this.config()
    ).updateOne(
      { _id: CONFIG_ID },
      { $set: { 'legacy.profile': profile, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  private config(): Promise<Collection<TenantConfigDocument>> {
    return this.tenantDb.collection<TenantConfigDocument>(TENANT_CONFIG_COLLECTION);
  }
}
