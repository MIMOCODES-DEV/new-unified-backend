import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { DeviceNotFoundError, InvalidUidError } from '../../domain/device.errors.js';
import type { FoundDevice } from '../../domain/device.js';
import { DeviceIdentity } from '../device-identity.js';

/** Longest uid an old mobile app sends (an install id); longer is refused. */
const MAX_APP_UID = 128;

export interface BindAppUidInput {
  mac: MacAddress;
  uid: string;
}

/**
 * The old iOS and Android apps' `reset_uid`: the app was reinstalled and has a new install id, so
 * the device's uid becomes the new one. As before, the MAC is the only proof: the old apps have no
 * other secret to send (DISCUSSIONS: legacy routes). Refused when the uid is already the stored one.
 */
@Injectable()
export class BindAppUidUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: BindAppUidInput,
  ): Promise<
    Result<{ found: FoundDevice; changed: boolean }, DeviceNotFoundError | InvalidUidError>
  > {
    const uid = input.uid.trim();
    if (!uid || uid.length > MAX_APP_UID) {
      return err(new InvalidUidError('The uid must be 1 to 128 characters'));
    }
    const found = await this.identity.findByMac(input.mac);
    if (!found) return err(new DeviceNotFoundError('No device with this MAC'));
    if (found.device.uid === uid) return ok({ found, changed: false });

    const changed = await this.identity.changeSettings(found.device.id, {
      uid,
      updatedAt: this.clock.now(),
    });
    return changed.ok ? ok({ found: changed.value, changed: true }) : changed;
  }
}
