import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { AppType } from '../../domain/app-type.js';
import { AppDeviceId, isSharedFallbackMac } from '../../domain/device-identity.js';
import { Device } from '../../domain/device.entity.js';
import {
  DeviceIdentityRequiredError,
  type InvalidAppTypeError,
} from '../../domain/device.errors.js';
import type { TrialDays } from '../../domain/trial-days.js';
import { DeviceKeyGenerator } from '../ports/device-key.generator.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { DeviceRepository, type InsertResult } from '../ports/device.repository.js';
import { RandomMacGenerator } from '../ports/random-mac.generator.js';

const MAX_INSERT_ATTEMPTS = 5;

export type RegisterOutcome = 'created' | 'existing';

export interface RegisterOrGetDeviceInput {
  /** May be empty or missing for devices that report no MAC. */
  macAddress?: string | undefined;
  appType: string;
  /** The app's install id; required when there is no usable MAC. */
  appDeviceId?: string | undefined;
}

export interface RegisterOrGetDeviceOutput {
  device: Device;
  outcome: RegisterOutcome;
}

export type RegisterOrGetDeviceError =
  InvalidMacAddressError | InvalidAppTypeError | DeviceIdentityRequiredError;

/**
 * Runs whenever an app reaches the backend: returns the paid device, else the pending one, else
 * creates a pending trial of the brand's length (7 days by default). A pending record is never
 * removed, so a device never gets a second trial.
 *
 * Identity is the normalized MAC. Devices with no MAC, or with a MAC many devices share (DEV-10),
 * are identified by their app_device_id instead and get their own random MAC.
 */
@Injectable()
export class RegisterOrGetDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly keys: DeviceKeyGenerator,
    private readonly clock: Clock,
    private readonly settings: DeviceSettings,
    private readonly macs: RandomMacGenerator,
  ) {}

  async execute(
    input: RegisterOrGetDeviceInput,
  ): Promise<Result<RegisterOrGetDeviceOutput, RegisterOrGetDeviceError>> {
    const appType = AppType.parse(input.appType);
    if (!appType.ok) return appType;
    let mac: MacAddress | null = null;
    if (input.macAddress !== undefined && input.macAddress.trim() !== '') {
      const parsed = MacAddress.parse(input.macAddress);
      if (!parsed.ok) return parsed;
      mac = parsed.value;
    }
    const installId = input.appDeviceId === undefined ? null : AppDeviceId.parse(input.appDeviceId);
    const now = this.clock.now();

    if (!mac || isSharedFallbackMac(mac)) {
      if (!installId?.ok) {
        return err(
          new DeviceIdentityRequiredError(
            'A device without a usable MAC address must send its app_device_id',
            { macAddress: input.macAddress ?? null },
          ),
        );
      }
      return ok(await this.byInstallId(installId.value, appType.value, now));
    }
    // A usable MAC is the identity. The install id is not stored then: it is unique among
    // install-id devices, and a box that changes MAC (ethernet → Wi-Fi) must not collide with itself.
    return ok(await this.byMac(mac, appType.value, now));
  }

  private async byMac(
    mac: MacAddress,
    appType: AppType,
    now: Date,
  ): Promise<RegisterOrGetDeviceOutput> {
    const existing =
      (await this.devices.findPaidByMac(mac)) ??
      (await this.devices.findPendingByMac(mac)) ??
      // An activation may have moved it pending → paid between the two reads above. Without this
      // check we would create a second, unpaid record for a device that just paid.
      (await this.devices.findPaidByMac(mac));
    if (existing) return { device: await this.visit(existing, now), outcome: 'existing' };

    return this.create(
      appType,
      now,
      () => mac,
      null,
      async (result) => {
        if (result !== 'mac_taken') return null;
        // Another request registered this MAC between our lookup and our insert.
        return (
          (await this.devices.findPendingByMac(mac)) ?? (await this.devices.findPaidByMac(mac))
        );
      },
    );
  }

  private async byInstallId(
    installId: AppDeviceId,
    appType: AppType,
    now: Date,
  ): Promise<RegisterOrGetDeviceOutput> {
    const existing =
      (await this.devices.findPaidByAppDeviceId(installId)) ??
      (await this.devices.findPendingByAppDeviceId(installId)) ??
      (await this.devices.findPaidByAppDeviceId(installId));
    if (existing) return { device: await this.visit(existing, now), outcome: 'existing' };

    // A fresh random MAC per attempt: a collision just means drawing another one.
    return this.create(
      appType,
      now,
      () => this.macs.next(),
      installId,
      async (result) => {
        if (result !== 'app_device_id_taken') return null;
        return (
          (await this.devices.findPendingByAppDeviceId(installId)) ??
          (await this.devices.findPaidByAppDeviceId(installId))
        );
      },
    );
  }

  /**
   * Inserts a new pending trial, retrying on key (and random-MAC) collisions. `onConflict` resolves
   * a lost race to the device the other request created; null means "retry".
   */
  private async create(
    appType: AppType,
    now: Date,
    macFor: () => MacAddress,
    installId: AppDeviceId | null,
    onConflict: (result: InsertResult) => Promise<Device | null>,
  ): Promise<RegisterOrGetDeviceOutput> {
    const trialDays: TrialDays = await this.settings.trialDays();
    for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt++) {
      const device = Device.registerTrial({
        id: randomUUID(),
        macAddress: macFor(),
        appType,
        deviceKey: this.keys.next(),
        now,
        trialDays,
        ...(installId ? { appDeviceId: installId } : {}),
      });
      const inserted = await this.devices.insertPending(device);
      if (inserted === 'inserted') return { device, outcome: 'created' };
      if (inserted === 'mac_taken' || inserted === 'app_device_id_taken') {
        const winner = await onConflict(inserted);
        if (winner) return { device: await this.visit(winner, now), outcome: 'existing' };
        if (inserted === 'app_device_id_taken') {
          throw new Error('Device vanished after a duplicate app_device_id insert');
        }
        // mac_taken without a winner: a random MAC collided with another device; draw again.
        if (!installId)
          throw new Error(`Device ${device.macAddress.value} vanished after a duplicate insert`);
      }
    }
    throw new Error(`Could not generate a unique device key after ${MAX_INSERT_ATTEMPTS} attempts`);
  }

  private async visit(device: Device, now: Date): Promise<Device> {
    device.recordVisit(now);
    await this.devices.touch(device);
    return device;
  }
}
