import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { PaidDevice } from '../../domain/device.js';
import { DeviceNotFoundError } from '../../domain/device.errors.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';

/** REC-2: the paid device holding this recovery code, expired or not (licensing checks that). */
@Injectable()
export class FindDeviceByRecoveryCodeUseCase {
  constructor(private readonly paid: PaidDeviceRepository) {}

  async execute(code: string): Promise<Result<PaidDevice, DeviceNotFoundError>> {
    const device = await this.paid.findByRecoveryCode(code);
    return device ? ok(device) : err(new DeviceNotFoundError('No device has this recovery code'));
  }
}
