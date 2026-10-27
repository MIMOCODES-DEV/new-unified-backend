import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { FoundDevice } from '../../domain/device.js';
import { DeviceKeyMismatchError } from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';

export interface VerifyDeviceKeyInput {
  mac: MacAddress;
  key: string;
}

/**
 * DEV-5: the device for a MAC and device key (the website login). An unknown MAC and a wrong key
 * get the same error, so a caller cannot tell which MACs exist.
 */
@Injectable()
export class VerifyDeviceKeyUseCase {
  constructor(private readonly identity: DeviceIdentity) {}

  async execute(input: VerifyDeviceKeyInput): Promise<Result<FoundDevice, DeviceKeyMismatchError>> {
    const found = await this.identity.findByMac(input.mac);
    if (!found || found.device.deviceKey !== input.key) {
      return err(new DeviceKeyMismatchError('MAC address or device key is not correct'));
    }
    return ok(found);
  }
}
