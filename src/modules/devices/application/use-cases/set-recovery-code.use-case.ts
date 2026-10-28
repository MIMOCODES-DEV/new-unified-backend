import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { DeviceNotFoundError, RecoveryCodeTakenError } from '../../domain/device.errors.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';

export interface SetRecoveryCodeInput {
  deviceId: string;
  /** Already drawn and normalized by licensing (8 characters, upper case). */
  code: string;
  expiresAt: Date;
}

/**
 * REC-1, the devices side: stores a paid device's new recovery code, replacing the old one. Only a
 * device in `devices` has a recovery record; a trial device is not found here.
 */
@Injectable()
export class SetRecoveryCodeUseCase {
  constructor(
    private readonly paid: PaidDeviceRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SetRecoveryCodeInput,
  ): Promise<Result<void, DeviceNotFoundError | RecoveryCodeTakenError>> {
    const set = await this.paid.setRecoveryCode(
      input.deviceId,
      input.code,
      input.expiresAt,
      this.clock.now(),
    );
    if (set === 'missing') {
      return err(new DeviceNotFoundError('Paid device not found', { deviceId: input.deviceId }));
    }
    if (set === 'taken') return err(new RecoveryCodeTakenError('Another device has this code'));
    return ok(undefined);
  }
}
