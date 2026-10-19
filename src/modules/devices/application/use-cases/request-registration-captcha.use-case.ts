import { Injectable } from '@nestjs/common';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import { CaptchaImages, CaptchaStore } from '../ports/captcha.js';
import { DeviceRepository } from '../ports/device.repository.js';

export type RegistrationCaptchaOutcome =
  { kind: 'already_verified' } | { kind: 'captcha'; svg: string; token: string };

/** V4 `recaptcha`: a captcha for a MAC that never passed one; nothing for one that did. */
@Injectable()
export class RequestRegistrationCaptchaUseCase {
  constructor(
    private readonly devices: DeviceRepository,
    private readonly captchas: CaptchaStore,
    private readonly images: CaptchaImages,
  ) {}

  async execute(input: {
    macAddress: string;
  }): Promise<Result<RegistrationCaptchaOutcome, InvalidMacAddressError>> {
    const mac = MacAddress.parse(input.macAddress);
    if (!mac.ok) return mac;

    const device =
      (await this.devices.findPaidByMac(mac.value)) ??
      (await this.devices.findPendingByMac(mac.value));
    if (device?.v4Verified) return ok({ kind: 'already_verified' });

    const { text, svg } = this.images.registration();
    const token = await this.captchas.create({ purpose: 'registration', mac: mac.value, text });
    return ok({ kind: 'captcha', svg, token });
  }
}
