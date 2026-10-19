/**
 * V4 device login rules (BobPlayer and the other V4 apps):
 * - Input: MAC, app type, u_id, and — for a new or unverified device — the captcha answer + token.
 * - Device known and verified:
 *   - same u_id (or none stored yet) → logged in;
 *   - different u_id → refused (u_id mismatch): the app's data was wiped, ownership must be
 *     re-proved. (The mismatch captcha itself is not built yet.)
 * - Device new or not verified → the captcha must be correct, then register-or-get the device
 *   (trial for a new MAC) and keep this u_id.
 */
import { Injectable } from '@nestjs/common';
import { DomainError } from '../../../../shared/kernel/domain-error.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { type Device, type InvalidUidError, parseUid } from '../../domain/device.entity.js';
import { DeviceRepository } from '../ports/device.repository.js';
import { IsCaptchaVerifiedUseCase, VerifyCaptchaUseCase } from './device-captcha.use-cases.js';
import { type RegisterDeviceError, RegisterDeviceUseCase } from './register-device.use-case.js';

export class CaptchaRequiredError extends DomainError {
  readonly code = 'devices.captcha_required';
}

export class InvalidCaptchaError extends DomainError {
  readonly code = 'devices.invalid_captcha';
}

export class UidMismatchError extends DomainError {
  readonly code = 'devices.uid_mismatch';
}

export interface LoginV4DeviceInput {
  mac: string;
  appType: string;
  uid: string;
  captchaCode?: string;
  captchaToken?: string;
}

export type LoginV4DeviceError =
  | InvalidMacAddressError
  | InvalidUidError
  | CaptchaRequiredError
  | InvalidCaptchaError
  | UidMismatchError
  | RegisterDeviceError;

@Injectable()
export class LoginV4DeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly isVerified: IsCaptchaVerifiedUseCase,
    private readonly verifyCaptcha: VerifyCaptchaUseCase,
    private readonly registerDevice: RegisterDeviceUseCase,
  ) {}

  async execute(input: LoginV4DeviceInput): Promise<Result<Device, LoginV4DeviceError>> {
    const mac = MacAddress.parse(input.mac);
    if (!mac.ok) return mac;
    const uid = parseUid(input.uid);
    if (!uid.ok) return uid;

    const existing = await this.devices.findByMac(mac.value);
    if (existing && (await this.isVerified.execute(input.mac))) {
      if (existing.uid && existing.uid !== uid.value) {
        return err(new UidMismatchError('Device ID mismatch'));
      }
      if (existing.assignUid(uid.value)) await this.devices.save(existing);
      return ok(existing);
    }

    if (!input.captchaCode || !input.captchaToken) {
      return err(new CaptchaRequiredError('Captcha code and token are required'));
    }
    if (!(await this.verifyCaptcha.execute(input.mac, input.captchaCode, input.captchaToken))) {
      return err(
        new InvalidCaptchaError(
          'Invalid or expired captcha. Please request a new captcha and try again.',
        ),
      );
    }

    const registered = await this.registerDevice.execute({
      mac: input.mac,
      appType: input.appType,
      uid: uid.value,
    });
    if (!registered.ok) return registered;
    const device = registered.value.device;
    if (device.assignUid(uid.value)) await this.devices.save(device);
    return ok(device);
  }
}
