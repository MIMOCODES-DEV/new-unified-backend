import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Device } from '../../domain/device.entity.js';
import {
  DeviceNotRegisteredError,
  DeviceTokenInvalidError,
  DeviceTokenMacMismatchError,
  type InvalidUidError,
} from '../../domain/device.errors.js';
import { Uid } from '../../domain/uid.js';
import { CaptchaImages, CaptchaStore } from '../ports/captcha.js';
import { DeviceRepository } from '../ports/device.repository.js';
import { DeviceSettings } from '../ports/device-settings.js';
import { checkUidOwnership, type UidChallenge } from './uid-ownership.js';

export interface GetV4DeviceInfoInput {
  /** From the decoded login token. */
  tokenDeviceId: string;
  tokenMac: string;
  /** From the request body; must match the token's MAC when sent. */
  macAddress?: string | undefined;
  uid: unknown;
  uidCaptchaCode?: string | undefined;
  uidCaptchaToken?: string | undefined;
}

export type GetV4DeviceInfoOutcome =
  { kind: 'device'; device: Device; trialDays: number } | UidChallenge;

export type GetV4DeviceInfoError =
  | InvalidMacAddressError
  | InvalidUidError
  | DeviceNotRegisteredError
  | DeviceTokenInvalidError
  | DeviceTokenMacMismatchError;

/** V4 `device_info`: the logged-in device's licence data, after token and u_id checks. */
@Injectable()
export class GetV4DeviceInfoUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly captchas: CaptchaStore,
    private readonly images: CaptchaImages,
    private readonly settings: DeviceSettings,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: GetV4DeviceInfoInput,
  ): Promise<Result<GetV4DeviceInfoOutcome, GetV4DeviceInfoError>> {
    const tokenMac = MacAddress.parse(input.tokenMac);
    if (!tokenMac.ok) return err(new DeviceTokenInvalidError('Invalid device login token'));
    if (input.macAddress !== undefined && input.macAddress !== '') {
      const bodyMac = MacAddress.parse(input.macAddress);
      if (!bodyMac.ok) return bodyMac;
      if (!bodyMac.value.equals(tokenMac.value)) {
        return err(new DeviceTokenMacMismatchError('Token does not match request mac_address'));
      }
    }

    const device =
      (await this.devices.findPaidByMac(tokenMac.value)) ??
      (await this.devices.findPendingByMac(tokenMac.value));
    if (!device) {
      return err(
        new DeviceNotRegisteredError(
          'Device not registered. Please complete captcha registration first.',
        ),
      );
    }
    if (device.id !== input.tokenDeviceId) {
      return err(new DeviceTokenInvalidError('Invalid device login token'));
    }

    const uid = Uid.parse(input.uid);
    if (!uid.ok) return uid;
    const challenge = await checkUidOwnership(
      {
        device,
        uid: uid.value,
        uidCaptchaCode: input.uidCaptchaCode,
        uidCaptchaToken: input.uidCaptchaToken,
      },
      this.captchas,
      this.images,
    );
    if (challenge) return ok(challenge);

    device.recordVisit(this.clock.now());
    await this.devices.touch(device);
    return ok({ kind: 'device', device, trialDays: (await this.settings.trialDays()).days });
  }
}
