import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { License } from '../../domain/license.js';
import { deviceLicense, type LicenseState } from '../../domain/license-rules.js';
import { LicensedDeviceNotFoundError } from '../../domain/licensing.errors.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';

export interface LicenseHistoryEntry {
  readonly license: License;
  /** The license's own state today, as if it were the current one. */
  readonly state: LicenseState;
  /** It is the device's current license. */
  readonly current: boolean;
}

/** LIC-3: every license a device ever got, oldest first, with who activated each one. */
@Injectable()
export class LicenseHistoryUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly clock: Clock,
  ) {}

  async execute(
    deviceId: string,
  ): Promise<Result<LicenseHistoryEntry[], LicensedDeviceNotFoundError>> {
    const device = await this.devices.find(deviceId);
    if (!device) return err(new LicensedDeviceNotFoundError('Device not found', { deviceId }));
    const now = this.clock.now();
    return ok(
      (await this.licenses.listByDevice(deviceId)).map((license) => ({
        license,
        state: deviceLicense({ trialEndsAt: null, current: license }, now).state,
        current: license.id === device.currentLicenseId,
      })),
    );
  }
}
