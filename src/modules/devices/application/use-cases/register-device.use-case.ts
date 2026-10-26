import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type {
  ApiVersion,
  DeviceVisit,
  FoundDevice,
  Platform,
  TrialDevice,
} from '../../domain/device.js';
import { isUsableMac, madeUpMac } from '../../domain/device-mac.js';
import { DeviceIdMissingError } from '../../domain/device.errors.js';
import { trialEndsAt } from '../../domain/trial.js';
import { DeviceIdentity } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';
import { TrialDeviceRepository } from '../ports/trial-device.repository.js';

/** Made-up MACs tried for one device before giving up; a clash is already very unlikely. */
const MADE_UP_MAC_ATTEMPTS = 5;

export interface RegisterDeviceInput {
  /** Null when the app could not read one. A fallback MAC counts as none. */
  mac: MacAddress | null;
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
 * DEV-1, DEV-2: an app call finds its device, or makes one with a trial.
 * - Found by MAC; without a usable MAC (none, or a fallback MAC many devices share), by app device
 *   id, then uid. A fallback MAC never creates or matches a device.
 * - Found: that device, trial or paid, with this visit (ip, versions, lastSeenAt) recorded.
 *   A trial that ended stays as it is: a device never gets a second trial.
 * - Not found: a new trial device (new id and device key, trial of the brand's `trial.days`).
 *   Without a usable MAC it gets one made from its app device id (or uid).
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

  async execute(
    input: RegisterDeviceInput,
  ): Promise<Result<RegisterDeviceOutput, DeviceIdMissingError>> {
    const now = this.clock.now();
    const visit: DeviceVisit = {
      ip: input.ip,
      appVersion: input.appVersion,
      apiVersion: input.apiVersion,
      at: now,
    };
    const mac = input.mac && isUsableMac(input.mac) ? input.mac : null;

    const known = mac ? await this.identity.findByMac(mac) : await this.findWithoutMac(input);
    if (known) return ok({ found: await this.recordVisit(known, visit), created: false });

    const trialDays = await this.settings.trialDays();
    if (mac) {
      const claim = await this.identity.claimTrial(this.newTrial(input, mac, now, trialDays));
      if (claim.created) return ok(claim);
      // Another call made this device a moment ago, or a device already has this app device id.
      return ok({ found: await this.recordVisit(claim.found, visit), created: false });
    }

    const source = input.appDeviceId ?? input.uid;
    if (!source) {
      return err(
        new DeviceIdMissingError('A device without a usable MAC must send an app device id or uid'),
      );
    }
    for (let attempt = 0; attempt < MADE_UP_MAC_ATTEMPTS; attempt++) {
      const madeUp = madeUpMac(source, attempt);
      const claim = await this.identity.claimTrial(this.newTrial(input, madeUp, now, trialDays));
      if (claim.created) return ok(claim);
      if (isSameDevice(claim.found, input)) {
        return ok({ found: await this.recordVisit(claim.found, visit), created: false });
      }
      // The made-up MAC belongs to another device: try the next one.
    }
    throw new Error(`No free made-up MAC after ${MADE_UP_MAC_ATTEMPTS} attempts`);
  }

  /** A device that sent no usable MAC: by app device id, then uid. */
  private async findWithoutMac(input: RegisterDeviceInput): Promise<FoundDevice | null> {
    const byAppDeviceId = input.appDeviceId
      ? await this.identity.findByAppDeviceId(input.appDeviceId)
      : null;
    if (byAppDeviceId) return byAppDeviceId;
    return input.uid ? this.identity.findByUid(input.uid) : null;
  }

  private newTrial(
    input: RegisterDeviceInput,
    mac: MacAddress,
    now: Date,
    trialDays: number,
  ): TrialDevice {
    return {
      id: randomUUID(),
      macAddress: mac.value,
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

/** Whether a device found by a made-up MAC is the one calling, not another with the same MAC. */
function isSameDevice(found: FoundDevice, input: RegisterDeviceInput): boolean {
  return input.appDeviceId
    ? found.device.appDeviceId === input.appDeviceId
    : found.device.uid === input.uid;
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
