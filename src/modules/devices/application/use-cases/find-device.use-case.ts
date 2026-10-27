import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { FoundDevice } from '../../domain/device.js';
import { DeviceNotFoundError } from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';

/** The device with this MAC, trial or paid. Read only. */
@Injectable()
export class FindDeviceUseCase {
  constructor(private readonly identity: DeviceIdentity) {}

  async execute(mac: MacAddress): Promise<Result<FoundDevice, DeviceNotFoundError>> {
    const found = await this.identity.findByMac(mac);
    return found ? ok(found) : err(new DeviceNotFoundError('Device not found', { mac: mac.value }));
  }
}
