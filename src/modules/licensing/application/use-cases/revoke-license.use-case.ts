import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { License } from '../../domain/license.js';
import {
  AlreadyRevokedError,
  LicensedDeviceNotFoundError,
  NoLicenseError,
} from '../../domain/licensing.errors.js';
import { LicenseLock } from '../ports/license-lock.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';

export interface RevokeLicenseInput {
  deviceId: string;
}

/**
 * LIC-3: revokes a device's current license (a refund, a chargeback, abuse). The row is kept with
 * `revoked` and `revokedAt`; the device stays in `devices`, with no valid license until it pays
 * again. Runs under the device's lock, like an activation.
 */
@Injectable()
export class RevokeLicenseUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly lock: LicenseLock,
    private readonly clock: Clock,
  ) {}

  execute(
    input: RevokeLicenseInput,
  ): Promise<Result<License, LicensedDeviceNotFoundError | NoLicenseError | AlreadyRevokedError>> {
    return this.lock.withDevice(input.deviceId, async () => {
      const device = await this.devices.find(input.deviceId);
      if (!device) {
        return err(
          new LicensedDeviceNotFoundError('Device not found', { deviceId: input.deviceId }),
        );
      }
      const current = device.currentLicenseId
        ? await this.licenses.findById(device.currentLicenseId)
        : null;
      if (!current) {
        return err(new NoLicenseError('This device has no license to revoke'));
      }
      if (current.revoked) {
        return err(new AlreadyRevokedError('This license is already revoked'));
      }
      const revoked: License = { ...current, revoked: true, revokedAt: this.clock.now() };
      await this.licenses.update(revoked);
      return ok(revoked);
    });
  }
}
