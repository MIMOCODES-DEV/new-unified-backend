import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type {
  ApiVersion,
  DeviceVisit,
  FoundDevice,
  Platform,
  TrialDevice,
} from '../../domain/device.js';
import { trialEndsAt } from '../../domain/trial.js';
import { DeviceIdentity } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';
import { TrialDeviceRepository } from '../ports/trial-device.repository.js';

export interface RegisterDeviceInput {
  mac: MacAddress;
  platform: Platform;
  appDeviceId: string | null;
  /** V4 apps only. */
  uid: string | null;
  ip: string;
  appVersion: string | null;
  apiVersion: ApiVersion;
}

export interface RegisterDeviceOutput {
  found: FoundDevice;
  /** True when this call made the device (and started its trial). */
  created: boolean;
}

/**
 * DEV-1: an app call finds its device by MAC, or makes one with a trial.
 * - Unknown MAC: a new trial device (new id and device key, trial of the brand's `trial.days`).
 * - Known MAC: that device, trial or paid, with this visit (ip, versions, lastSeenAt) recorded.
 *   A trial that ended stays as it is: a device never gets a second trial.
 */
@Injectable()
export class RegisterDeviceUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly trials: TrialDeviceRepository,
    private readonly paid: PaidDeviceRepository,
    private readonly settings: DeviceSettings,
    private readonly keys: DeviceKeyGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: RegisterDeviceInput): Promise<RegisterDeviceOutput> {
    const now = this.clock.now();
    const visit: DeviceVisit = {
      ip: input.ip,
      appVersion: input.appVersion,
      apiVersion: input.apiVersion,
      at: now,
    };

    const known = await this.identity.findByMac(input.mac);
    if (known) return { found: await this.recordVisit(known, visit), created: false };

    const trialDays = await this.settings.trialDays();
    const claim = await this.identity.claimTrial(this.newTrial(input, now, trialDays));
    if (claim.created) return claim;
    // Another call made this device a moment ago, or a device already has this app device id.
    return { found: await this.recordVisit(claim.found, visit), created: false };
  }

  private newTrial(input: RegisterDeviceInput, now: Date, trialDays: number): TrialDevice {
    return {
      id: randomUUID(),
      macAddress: input.mac.value,
      appDeviceId: input.appDeviceId,
      platform: input.platform,
      deviceKey: this.keys.next(),
      uid: input.uid,
      stalkerEnabled: false,
      parentPin: null,
      apiVersion: input.apiVersion,
      appVersion: input.appVersion,
      ip: input.ip,
      lastSeenAt: now,
      legacy: null,
      createdAt: now,
      updatedAt: now,
      trialStartedAt: now,
      trialEndsAt: trialEndsAt(now, trialDays),
      playlistCount: 0,
      firstPlaylistAt: null,
    };
  }

  /** Saves the visit and returns the device as it is stored after it. */
  private async recordVisit(found: FoundDevice, visit: DeviceVisit): Promise<FoundDevice> {
    const saved = found.paid
      ? await this.paid.recordVisit(found.device.id, visit)
      : await this.trials.recordVisit(found.device.id, visit);
    if (saved) return withVisit(found, visit);

    // The trial moved to devices in between: record the visit there.
    const moved = await this.identity.findById(found.device.id);
    if (!moved?.paid) return found;
    await this.paid.recordVisit(moved.device.id, visit);
    return withVisit(moved, visit);
  }
}

function withVisit(found: FoundDevice, visit: DeviceVisit): FoundDevice {
  const fields = {
    ip: visit.ip,
    appVersion: visit.appVersion,
    apiVersion: visit.apiVersion,
    lastSeenAt: visit.at,
    updatedAt: visit.at,
  };
  return found.paid
    ? { paid: true, device: { ...found.device, ...fields } }
    : { paid: false, device: { ...found.device, ...fields } };
}
