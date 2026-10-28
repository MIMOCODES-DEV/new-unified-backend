import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { deviceLicense } from '../../domain/license-rules.js';
import {
  LicensedDeviceNotFoundError,
  LicenseNotRunningError,
  RecoveryNeedsPaidDeviceError,
} from '../../domain/licensing.errors.js';
import { RECOVERY_CODE_TTL_MS } from '../../domain/recovery-code.js';
import { LicenseLock } from '../ports/license-lock.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';
import { RecoveryCodeGenerator } from '../ports/recovery-code-generator.js';

export interface CreateRecoveryCodeInput {
  deviceId: string;
}

export interface RecoveryCode {
  /** 8 characters, shown on the website and typed on the new TV. */
  code: string;
  expiresAt: Date;
}

/** Draws again when another device holds the drawn code; past this, something is wrong. */
const MAX_DRAWS = 5;

/**
 * REC-1: a recovery code for a paid device, made on the website (ibo, cr), so the device can be
 * moved to a new TV. Only a device in `devices` with a running license gets one (an expired or
 * revoked one has nothing to recover). It lasts 30 minutes; a new code replaces the old one.
 */
@Injectable()
export class CreateRecoveryCodeUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly codes: RecoveryCodeGenerator,
    private readonly lock: LicenseLock,
    private readonly clock: Clock,
  ) {}

  execute(
    input: CreateRecoveryCodeInput,
  ): Promise<
    Result<
      RecoveryCode,
      LicensedDeviceNotFoundError | RecoveryNeedsPaidDeviceError | LicenseNotRunningError
    >
  > {
    return this.lock.withDevice(input.deviceId, async () => {
      const device = await this.devices.find(input.deviceId);
      if (!device) {
        return err(
          new LicensedDeviceNotFoundError('Device not found', { deviceId: input.deviceId }),
        );
      }
      if (!device.paid || !device.currentLicenseId) {
        return err(
          new RecoveryNeedsPaidDeviceError('Only an activated device gets a recovery code'),
        );
      }
      const now = this.clock.now();
      const current = await this.licenses.findById(device.currentLicenseId);
      const state = deviceLicense({ trialEndsAt: null, current }, now);
      if (!state.active) {
        return err(
          new LicenseNotRunningError('Only a running license can be recovered', {
            state: state.state,
          }),
        );
      }

      const expiresAt = new Date(now.getTime() + RECOVERY_CODE_TTL_MS);
      for (let draw = 0; draw < MAX_DRAWS; draw++) {
        const code = this.codes.next();
        const set = await this.devices.setRecoveryCode(device.id, code, expiresAt);
        if (set === 'done') return ok({ code, expiresAt });
        if (set === 'not_found') {
          return err(new LicensedDeviceNotFoundError('Device not found', { deviceId: device.id }));
        }
      }
      throw new Error(`No free recovery code after ${MAX_DRAWS} draws`);
    });
  }
}
