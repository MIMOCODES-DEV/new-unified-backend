import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { FoundDevice } from '../../domain/device.js';
import { DeviceNotFoundError } from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';

/** The device with this id, trial or paid. Read only. */
@Injectable()
export class FindDeviceByIdUseCase {
  constructor(private readonly identity: DeviceIdentity) {}

  async execute(deviceId: string): Promise<Result<FoundDevice, DeviceNotFoundError>> {
    const found = await this.identity.findById(deviceId);
    return found ? ok(found) : err(new DeviceNotFoundError('Device not found', { deviceId }));
  }
}
