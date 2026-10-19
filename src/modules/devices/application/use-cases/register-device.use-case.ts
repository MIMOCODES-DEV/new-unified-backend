/**
 * Register device rules:
 * - Input: a MAC address and an app type, for the brand of the current request.
 * - MAC already known → return that device unchanged (no second trial).
 * - MAC unknown → create it with a trial of the brand's trial days and a new device key.
 * - Two requests for the same new MAC at the same time → only one device is created;
 *   the other request gets that same device.
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import { type InvalidAppTypeError, parseAppType } from '../../domain/app-type.js';
import { Device, type InvalidDeviceKeyError } from '../../domain/device.entity.js';
import { type InvalidLicenseError, License } from '../../domain/license.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';
import { DeviceRepository } from '../ports/device.repository.js';
import { DeviceSettings } from '../ports/device-settings.js';

export interface RegisterDeviceInput {
  mac: string;
  appType: string;
}

export interface RegisterDeviceOutput {
  device: Device;
  /** true if this call created the device, false if it already existed. */
  created: boolean;
  /** The brand's trial length (old apps show it). */
  trialDays: number;
}

export type RegisterDeviceError =
  InvalidMacAddressError | InvalidAppTypeError | InvalidLicenseError | InvalidDeviceKeyError;

@Injectable()
export class RegisterDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly settings: DeviceSettings,
    private readonly keys: DeviceKeyGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: RegisterDeviceInput,
  ): Promise<Result<RegisterDeviceOutput, RegisterDeviceError>> {
    const mac = MacAddress.parse(input.mac);
    if (!mac.ok) return mac;
    const appType = parseAppType(input.appType);
    if (!appType.ok) return appType;

    const trialDays = await this.settings.trialDays();
    const existing = await this.devices.findByMac(mac.value);
    if (existing) return ok({ device: existing, created: false, trialDays });

    const now = this.clock.now();
    const trial = License.startTrial(trialDays, now);
    if (!trial.ok) return trial;

    const device = Device.register({
      id: randomUUID(),
      mac: mac.value,
      appType: appType.value,
      deviceKey: this.keys.next(),
      trial: trial.value,
      now,
    });
    if (!device.ok) return device;

    if (await this.devices.insert(device.value)) {
      return ok({ device: device.value, created: true, trialDays });
    }
    // Lost a race: another request created this MAC a moment ago. Return that one.
    const winner = await this.devices.findByMac(mac.value);
    if (!winner) throw new Error(`Device ${mac.value.value} reported as duplicate but not found`);
    return ok({ device: winner, created: false, trialDays });
  }
}
