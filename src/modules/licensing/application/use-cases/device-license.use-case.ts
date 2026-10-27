import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { License } from '../../domain/license.js';
import { type DeviceLicense, deviceLicense } from '../../domain/license-rules.js';
import { LicensedDeviceNotFoundError } from '../../domain/licensing.errors.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';

export interface DeviceLicenseOutput extends DeviceLicense {
  /** The current license row; null for a trial device. */
  readonly license: License | null;
}

/**
 * LIC-3: what a device may do right now: trial, yearly, lifetime, expired or revoked, and until
 * when. Expiry is worked out from the dates at each call, never stored. The app routes put it in
 * their replies (the old `is_trial` and `expire_date`).
 */
@Injectable()
export class DeviceLicenseUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly clock: Clock,
  ) {}

  async execute(
    deviceId: string,
  ): Promise<Result<DeviceLicenseOutput, LicensedDeviceNotFoundError>> {
    const device = await this.devices.find(deviceId);
    if (!device) return err(new LicensedDeviceNotFoundError('Device not found', { deviceId }));
    const license = device.currentLicenseId
      ? await this.licenses.findById(device.currentLicenseId)
      : null;
    const state = deviceLicense(
      { trialEndsAt: device.trialEndsAt, current: license },
      this.clock.now(),
    );
    return ok({ ...state, license });
  }
}
