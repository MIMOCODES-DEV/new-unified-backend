import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { FoundDevice } from '../../domain/device.js';
import { DeviceNotFoundError } from '../../domain/device.errors.js';
import { DeviceIdentity } from '../device-identity.js';

/**
 * The device a V4 login token names. Tokens made by this backend carry the device id; tokens an
 * old backend made before the data move carry its old `_id`, kept in `legacy.id`, so a logged-in
 * app keeps working after the move. Read only.
 */
@Injectable()
export class FindDeviceByTokenIdUseCase {
  constructor(private readonly identity: DeviceIdentity) {}

  async execute(tokenId: string): Promise<Result<FoundDevice, DeviceNotFoundError>> {
    const found =
      (await this.identity.findById(tokenId)) ?? (await this.identity.findByLegacyId(tokenId));
    return found ? ok(found) : err(new DeviceNotFoundError('Device not found', { tokenId }));
  }
}
