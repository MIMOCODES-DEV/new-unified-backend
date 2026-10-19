import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Device } from '../../domain/device.entity.js';
import {
  CaptchaInvalidError,
  CaptchaRequiredError,
  type DeviceIdentityRequiredError,
  type InvalidAppTypeError,
  type InvalidUidError,
} from '../../domain/device.errors.js';
import { Uid } from '../../domain/uid.js';
import { CaptchaImages, CaptchaStore } from '../ports/captcha.js';
import { DeviceRepository } from '../ports/device.repository.js';
import { RegisterOrGetDeviceUseCase } from './register-or-get-device.use-case.js';
import { checkUidOwnership, type UidChallenge } from './uid-ownership.js';

export interface LoginV4DeviceInput {
  macAddress: string;
  appType: string;
  uid: unknown;
  recaptchaCode?: string | undefined;
  recaptchaToken?: string | undefined;
  uidCaptchaCode?: string | undefined;
  uidCaptchaToken?: string | undefined;
}

export type LoginV4Outcome = { kind: 'logged_in'; device: Device } | UidChallenge;

export type LoginV4Error =
  | InvalidMacAddressError
  | InvalidAppTypeError
  | InvalidUidError
  | CaptchaRequiredError
  | CaptchaInvalidError
  | DeviceIdentityRequiredError;

/**
 * V4 `device_login`. A device that never passed the registration captcha must send a correct one;
 * a new MAC is then registered as a pending trial (RegisterOrGetDeviceUseCase). A verified device
 * logs in directly, unless another install (other u_id) has to prove ownership first.
 */
@Injectable()
export class LoginV4DeviceUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly captchas: CaptchaStore,
    private readonly images: CaptchaImages,
    private readonly register: RegisterOrGetDeviceUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginV4DeviceInput): Promise<Result<LoginV4Outcome, LoginV4Error>> {
    const mac = MacAddress.parse(input.macAddress);
    if (!mac.ok) return mac;
    const uid = Uid.parse(input.uid);
    if (!uid.ok) return uid;

    const existing =
      (await this.devices.findPaidByMac(mac.value)) ??
      (await this.devices.findPendingByMac(mac.value));

    if (existing?.v4Verified) {
      const challenge = await checkUidOwnership(
        {
          device: existing,
          uid: uid.value,
          uidCaptchaCode: input.uidCaptchaCode,
          uidCaptchaToken: input.uidCaptchaToken,
        },
        this.captchas,
        this.images,
      );
      if (challenge) return ok(challenge);
      return ok({ kind: 'logged_in', device: await this.save(existing) });
    }

    if (!input.recaptchaCode || !input.recaptchaToken) {
      return err(new CaptchaRequiredError('Captcha code and token are required'));
    }
    const passed = await this.captchas.consume({
      purpose: 'registration',
      mac: mac.value,
      token: input.recaptchaToken,
      answer: input.recaptchaCode,
    });
    if (!passed) {
      return err(
        new CaptchaInvalidError(
          'Invalid or expired captcha. Please request a new captcha and try again.',
        ),
      );
    }

    let device = existing;
    if (!device) {
      const registered = await this.register.execute({
        macAddress: mac.value.value,
        appType: input.appType,
      });
      if (!registered.ok) return registered;
      device = registered.value.device;
    }
    // A captcha proves a human, not ownership: like the old backends, an existing u_id is kept.
    device.adoptUidIfMissing(uid.value);
    device.markV4Verified();
    return ok({ kind: 'logged_in', device: await this.save(device) });
  }

  private async save(device: Device): Promise<Device> {
    device.recordVisit(this.clock.now());
    await this.devices.touch(device);
    return device;
  }
}
