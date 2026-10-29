import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { FoundDevice, Platform } from '../../domain/device.js';
import { isUsableMac } from '../../domain/device-mac.js';
import {
  CaptchaRequiredError,
  type DeviceIdMissingError,
  type DeviceNotFoundError,
  type InvalidCaptchaError,
  InvalidUidError,
  type OlderApiRefusedError,
  type PlatformMismatchError,
  UidMismatchError,
  UsableMacRequiredError,
} from '../../domain/device.errors.js';
import { Captchas } from '../captchas.js';
import { DeviceIdentity } from '../device-identity.js';
import { RegisterDeviceUseCase } from './register-device.use-case.js';

/** A captcha the app answered: the token it got with the picture, and what was typed. */
export interface AnsweredCaptcha {
  token: string;
  answer: string;
}

export interface LoginV4DeviceInput {
  mac: MacAddress;
  platform: Platform;
  /** 6 letters or digits; the app makes it once and keeps it. Case does not matter. */
  uid: string;
  ip: string;
  appVersion: string | null;
  /**
   * The app's own install id, when it sends one. Only recorded on the device (V4 finds the device by
   * MAC and uid); left out when another device already has it.
   */
  appDeviceId: string | null;
  /** The registration captcha; needed until this MAC has solved one. */
  captcha: AnsweredCaptcha | null;
  /** The uid recovery captcha; needed when the uid does not match. */
  uidCaptcha: AnsweredCaptcha | null;
}

export type LoginV4DeviceError =
  | UsableMacRequiredError
  | InvalidUidError
  | CaptchaRequiredError
  | InvalidCaptchaError
  | UidMismatchError
  | DeviceIdMissingError
  | DeviceNotFoundError
  | PlatformMismatchError
  | OlderApiRefusedError;

const UID = /^[A-Z0-9]{6}$/;
const APP_DEVICE_ID_MAX = 128;

/**
 * DEV-4: a V4 app logs in, registering its device the first time.
 * - A MAC that never solved a captcha must send a solved registration captcha; once solved, the
 *   MAC skips it on every later login.
 * - A MAC that solved one before, with a stored uid that differs, must solve the uid recovery
 *   captcha (it shows the stored uid); then the new uid is stored.
 * - Then the device is found or made with a trial (DEV-1) and keeps this uid.
 */
@Injectable()
export class LoginV4DeviceUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly captchas: Captchas,
    private readonly register: RegisterDeviceUseCase,
    private readonly clock: Clock,
  ) {}

  async execute(input: LoginV4DeviceInput): Promise<Result<FoundDevice, LoginV4DeviceError>> {
    if (!isUsableMac(input.mac)) {
      return err(new UsableMacRequiredError('V4 login needs the device MAC'));
    }
    const uid = input.uid.trim().toUpperCase();
    if (!UID.test(uid)) return err(new InvalidUidError('A uid must be 6 letters or digits'));

    const checked = (await this.captchas.solvedBefore(input.mac))
      ? await this.checkUid(input, uid)
      : await this.checkRegistrationCaptcha(input);
    if (!checked.ok) return checked;

    const registered = await this.register.execute({
      mac: input.mac,
      platform: input.platform,
      appDeviceId: null,
      uid,
      ip: input.ip,
      appVersion: input.appVersion,
      apiVersion: 'v4',
    });
    if (!registered.ok) return registered;
    const found = registered.value.found;
    const appDeviceId = await this.newAppDeviceId(found, input.appDeviceId);
    if (found.device.uid === uid && !appDeviceId) return ok(found);
    return this.identity.changeSettings(found.device.id, {
      uid,
      ...(appDeviceId ? { appDeviceId } : {}),
      updatedAt: this.clock.now(),
    });
  }

  /** The app device id to record: null when there is none, it is already stored, or another device has it. */
  private async newAppDeviceId(found: FoundDevice, sent: string | null): Promise<string | null> {
    const appDeviceId = sent?.trim().slice(0, APP_DEVICE_ID_MAX) || null;
    if (!appDeviceId || found.device.appDeviceId === appDeviceId) return null;
    const holder = await this.identity.findByAppDeviceId(appDeviceId);
    return holder && holder.device.id !== found.device.id ? null : appDeviceId;
  }

  /** A device that solved its captcha before: the uid must match, or the recovery captcha be solved. */
  private async checkUid(
    input: LoginV4DeviceInput,
    uid: string,
  ): Promise<Result<void, UidMismatchError | InvalidCaptchaError>> {
    const stored = (await this.identity.findByMac(input.mac))?.device.uid;
    if (!stored || stored.toUpperCase() === uid) return ok(undefined);
    if (!input.uidCaptcha) {
      return err(new UidMismatchError('Device ID mismatch', { mac: input.mac.value }));
    }
    const solved = await this.captchas.answer({
      kind: 'uidRecovery',
      mac: input.mac,
      ...input.uidCaptcha,
    });
    return solved.ok ? ok(undefined) : solved;
  }

  /** A MAC that never solved a captcha must send one now. */
  private async checkRegistrationCaptcha(
    input: LoginV4DeviceInput,
  ): Promise<Result<void, CaptchaRequiredError | InvalidCaptchaError>> {
    if (!input.captcha) return err(new CaptchaRequiredError('Captcha code and token are required'));
    const solved = await this.captchas.answer({ kind: 'v4', mac: input.mac, ...input.captcha });
    return solved.ok ? ok(undefined) : solved;
  }
}
