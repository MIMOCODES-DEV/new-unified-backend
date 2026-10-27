import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { type DeviceNotFoundError, InvalidParentPinError } from '../../domain/device.errors.js';
import { isValidParentPin } from '../../domain/owner-settings.js';
import { DeviceIdentity } from '../device-identity.js';

export interface SetParentPinInput {
  deviceId: string;
  /**
   * 4 digits turns parental control on with that PIN (or changes it); null or empty turns it off.
   * The apps' toggle sends `"off"`: their routes pass it here as null, and answer `"off"` for null.
   */
  pin: string | null;
}

/** DEV-5: the apps' parental control toggle: on with a PIN, a new PIN, or off. Stored as entered. */
@Injectable()
export class SetParentPinUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SetParentPinInput,
  ): Promise<Result<{ parentPin: string | null }, DeviceNotFoundError | InvalidParentPinError>> {
    const parentPin = input.pin ? input.pin : null;
    if (parentPin !== null && !isValidParentPin(parentPin)) {
      return err(new InvalidParentPinError('A parent PIN must be 4 digits'));
    }
    const changed = await this.identity.changeSettings(input.deviceId, {
      parentPin,
      updatedAt: this.clock.now(),
    });
    return changed.ok ? ok({ parentPin }) : changed;
  }
}
