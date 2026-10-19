import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { AppUid } from '../../domain/device-identity.js';
import {
  DeviceUidMismatchError,
  type InvalidAppDeviceIdError,
} from '../../domain/device.errors.js';
import { DeviceRepository } from '../ports/device.repository.js';
import {
  type RegisterOrGetDeviceError,
  type RegisterOrGetDeviceOutput,
  RegisterOrGetDeviceUseCase,
} from './register-or-get-device.use-case.js';

/**
 * `device_login` of the iOS and Android v2-v3 apps: register-or-get by MAC, then the install uid
 * rule. A device keeps the first install uid it logs in with; another uid is refused.
 * Unlike the old code, a device first registered by another app family (no uid yet) adopts the uid
 * instead of being refused forever.
 */
@Injectable()
export class LoginAppDeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly register: RegisterOrGetDeviceUseCase,
  ) {}

  async execute(input: {
    macAddress: string;
    appType: string;
    uid: unknown;
  }): Promise<
    Result<
      RegisterOrGetDeviceOutput,
      RegisterOrGetDeviceError | InvalidAppDeviceIdError | DeviceUidMismatchError
    >
  > {
    const uid = AppUid.parse(input.uid);
    if (!uid.ok) return uid;
    const result = await this.register.execute({
      macAddress: input.macAddress,
      appType: input.appType,
    });
    if (!result.ok) return result;

    const { device } = result.value;
    if (device.appUid && !device.appUid.equals(uid.value)) {
      return err(new DeviceUidMismatchError('Device UID mismatch!'));
    }
    if (device.adoptAppUidIfMissing(uid.value)) await this.devices.touch(device);
    return ok(result.value);
  }
}
