import { Injectable } from '@nestjs/common';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { Device } from '../../domain/device.entity.js';
import { DeviceRepository } from '../ports/device.repository.js';
import { DeviceSettings } from '../ports/device-settings.js';

/** Reads a device of the current brand by MAC (null if unknown or the MAC is invalid). */
@Injectable()
export class GetDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly settings: DeviceSettings,
  ) {}

  async execute(rawMac: string): Promise<{ device: Device; trialDays: number } | null> {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok) return null;
    const device = await this.devices.findByMac(mac.value);
    return device ? { device, trialDays: await this.settings.trialDays() } : null;
  }
}
