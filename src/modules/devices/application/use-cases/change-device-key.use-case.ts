import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { type DeviceNotFoundError, InvalidDeviceKeyError } from '../../domain/device.errors.js';
import { isValidDeviceKey } from '../../domain/owner-settings.js';
import { DeviceIdentity } from '../device-identity.js';
import { DeviceKeyGenerator } from '../ports/device-key-generator.js';

export interface ChangeDeviceKeyInput {
  deviceId: string;
  /** The owner's choice; null makes a new random one. */
  key: string | null;
}

/** DEV-5: gives a device a new device key. The old key stops working at once. */
@Injectable()
export class ChangeDeviceKeyUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly keys: DeviceKeyGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: ChangeDeviceKeyInput,
  ): Promise<Result<{ deviceKey: string }, DeviceNotFoundError | InvalidDeviceKeyError>> {
    const deviceKey = input.key ?? this.keys.next();
    if (!isValidDeviceKey(deviceKey)) {
      return err(new InvalidDeviceKeyError('A device key must be 6 digits'));
    }
    const changed = await this.identity.changeSettings(input.deviceId, {
      deviceKey,
      updatedAt: this.clock.now(),
    });
    return changed.ok ? ok({ deviceKey }) : changed;
  }
}
