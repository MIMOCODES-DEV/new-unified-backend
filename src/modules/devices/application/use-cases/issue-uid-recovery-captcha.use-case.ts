import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { DeviceNotFoundError } from '../../domain/device.errors.js';
import { Captchas } from '../captchas.js';
import { DeviceIdentity } from '../device-identity.js';
import { CaptchaImage } from '../ports/captcha-image.js';

export interface IssueUidRecoveryCaptchaInput {
  mac: MacAddress;
  platform: string | null;
}

/**
 * DEV-4: the captcha for a V4 app whose uid does not match. It shows the device's stored uid; the
 * person types it back to prove they are in front of the TV, as in the old cr backend.
 */
@Injectable()
export class IssueUidRecoveryCaptchaUseCase {
  constructor(
    private readonly identity: DeviceIdentity,
    private readonly captchas: Captchas,
    private readonly image: CaptchaImage,
  ) {}

  async execute(
    input: IssueUidRecoveryCaptchaInput,
  ): Promise<Result<{ token: string; svg: string; text: string }, DeviceNotFoundError>> {
    const found = await this.identity.findByMac(input.mac);
    const uid = found?.device.uid;
    if (!uid) {
      return err(
        new DeviceNotFoundError('No device with a uid for this MAC', { mac: input.mac.value }),
      );
    }
    const { token } = await this.captchas.issue({
      kind: 'uidRecovery',
      text: uid,
      mac: input.mac,
      appDeviceId: null,
      platform: input.platform,
    });
    // `text` is for dev tooling only; an app route never sends it.
    return ok({ token, svg: this.image.draw(uid), text: uid });
  }
}
