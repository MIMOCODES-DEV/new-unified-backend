import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { type AppDeviceIdInUseError, DeviceNotFoundError } from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';
import { PaidDeviceRepository } from '../ports/paid-device.repository.js';

export interface ApplyLicenseInput {
  deviceId: string;
  /** The new license row (licensing wrote it). */
  licenseId: string;
  activatedAt: Date;
  /** The reseller who sold it, when one did. */
  resellerId: string | null;
  customerId: string | null;
}

/**
 * LIC-2, the devices side of an activation: a trial device moves to `devices` (same id, MAC and
 * device key) with this license as its current one; a paid device just points at the new license.
 */
@Injectable()
export class ApplyLicenseUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly paid: PaidDeviceRepository,
  ) {}

  async execute(
    input: ApplyLicenseInput,
  ): Promise<Result<void, DeviceNotFoundError | AppDeviceIdInUseError>> {
    const found = await this.identity.findById(input.deviceId);
    if (!found)
      return err(new DeviceNotFoundError('Device not found', { deviceId: input.deviceId }));

    if (found.paid) {
      const set = await this.paid.setCurrentLicense(
        input.deviceId,
        input.licenseId,
        input.resellerId,
        input.activatedAt,
      );
      return set ? ok(undefined) : err(new DeviceNotFoundError('Device not found'));
    }
    const moved = await this.identity.moveToPaid(input.deviceId, {
      currentLicenseId: input.licenseId,
      activatedAt: input.activatedAt,
      resellerId: input.resellerId,
      customerId: input.customerId,
    });
    return moved.ok ? ok(undefined) : moved;
  }
}
