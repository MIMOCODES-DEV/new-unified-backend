import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { ActivatedBy, License, LicenseType } from '../../domain/license.js';
import { CREDIT_COST, newLicenseEnd } from '../../domain/license-rules.js';
import {
  type AlreadyLifetimeError,
  DeviceConflictError,
  LicensedDeviceNotFoundError,
} from '../../domain/licensing.errors.js';
import { LicenseLock } from '../ports/license-lock.js';
import { LicenseRepository } from '../ports/license.repository.js';
import { LicensedDevices } from '../ports/licensed-devices.js';

export interface ActivateLicenseInput {
  deviceId: string;
  type: LicenseType;
  /** Who paid: admin, reseller, code, coupon, payment, store, transfer or plan, and the actor. */
  activatedBy: ActivatedBy;
  /**
   * The transaction, code, coupon or subscription that paid. The same source twice activates once:
   * a payment callback that arrives twice, a code typed twice.
   */
  sourceId: string | null;
  /** Bought in a multi-device store order: a MAC switch will be refused. */
  multiActivate: boolean;
  /** The reseller who sold it, when one did; becomes the device's reseller. */
  resellerId?: string | null;
  customerId?: string | null;
}

export interface ActivateLicenseOutput {
  license: License;
  /** False when this source had already activated the device: nothing changed. */
  created: boolean;
}

/**
 * LIC-2: activates a device from any source. The sources themselves (resellers, codes, payments,
 * the store, …) come in later phases; here the source is recorded.
 * - Writes a `licenses` row; its end follows LIC-1 (a year stacks on what is running).
 * - A trial device moves to `devices`; the device points at the new license.
 * - Runs under the device's lock, so two activations of one device never read the same end date.
 */
@Injectable()
export class ActivateLicenseUseCase {
  constructor(
    private readonly licenses: LicenseRepository,
    private readonly devices: LicensedDevices,
    private readonly lock: LicenseLock,
    private readonly clock: Clock,
  ) {}

  execute(
    input: ActivateLicenseInput,
  ): Promise<
    Result<
      ActivateLicenseOutput,
      LicensedDeviceNotFoundError | AlreadyLifetimeError | DeviceConflictError
    >
  > {
    return this.lock.withDevice(input.deviceId, () => this.activate(input));
  }

  private async activate(
    input: ActivateLicenseInput,
  ): Promise<
    Result<
      ActivateLicenseOutput,
      LicensedDeviceNotFoundError | AlreadyLifetimeError | DeviceConflictError
    >
  > {
    if (input.sourceId) {
      const done = await this.licenses.findBySource(input.deviceId, input.sourceId);
      if (done) return ok({ license: done, created: false });
    }
    const device = await this.devices.find(input.deviceId);
    if (!device) {
      return err(new LicensedDeviceNotFoundError('Device not found', { deviceId: input.deviceId }));
    }
    const current = device.currentLicenseId
      ? await this.licenses.findById(device.currentLicenseId)
      : null;

    const now = this.clock.now();
    const end = newLicenseEnd(input.type, { trialEndsAt: device.trialEndsAt, current }, now);
    if (!end.ok) return end;

    const license: License = {
      id: randomUUID(),
      deviceId: device.id,
      type: input.type,
      expiresAt: end.value,
      revoked: false,
      revokedAt: null,
      activatedBy: input.activatedBy,
      creditCost: CREDIT_COST[input.type],
      multiActivate: input.multiActivate,
      sourceId: input.sourceId,
      createdAt: now,
    };
    // The row first: the device never points at a license that is not there.
    await this.licenses.insert(license);
    const marked = await this.devices.markPaid(device.id, {
      licenseId: license.id,
      activatedAt: now,
      resellerId: input.resellerId ?? null,
      customerId: input.customerId ?? null,
    });
    if (marked !== 'done') {
      await this.licenses.delete(license.id);
      return marked === 'not_found'
        ? err(new LicensedDeviceNotFoundError('Device not found', { deviceId: device.id }))
        : err(
            new DeviceConflictError('The device cannot move to devices', { deviceId: device.id }),
          );
    }
    return ok({ license, created: true });
  }
}
