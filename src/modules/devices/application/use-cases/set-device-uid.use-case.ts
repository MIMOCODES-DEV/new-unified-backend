import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { type DeviceNotFoundError, InvalidUidError } from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';

/** The V4 apps' uid: 6 letters or digits, compared in upper case (as the V4 login does). */
const UID = /^[A-Z0-9]{6}$/;

/**
 * The website's "reset UID": the owner types the uid the reinstalled app now shows, so the next V4
 * login matches without the uid captcha. Only the device's own owner reaches this (the route checks).
 */
@Injectable()
export class SetDeviceUidUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly clock: Clock,
  ) {}

  async execute(input: {
    deviceId: string;
    uid: string;
  }): Promise<Result<{ uid: string }, DeviceNotFoundError | InvalidUidError>> {
    const uid = input.uid.trim().toUpperCase();
    if (!UID.test(uid)) return err(new InvalidUidError('A uid must be 6 letters or digits'));
    const changed = await this.identity.changeSettings(input.deviceId, {
      uid,
      updatedAt: this.clock.now(),
    });
    return changed.ok ? ok({ uid }) : changed;
  }
}
