import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { Captchas } from '../captchas.js';
import { CaptchaImage } from '../ports/captcha-image.js';

export interface IssueCaptchaInput {
  /** `v4` = device registration, `web` = the website. */
  kind: 'v4' | 'web';
  mac: MacAddress | null;
  appDeviceId: string | null;
  platform: string | null;
  /** Characters to type; each app has its own (V4: 4, old TV: 2, Android v3: 6). */
  length: number;
}

/** DEV-4: a new captcha. The app shows the picture and sends the token back with the answer. */
@Injectable()
export class IssueCaptchaUseCase {
  constructor(
    private readonly captchas: Captchas,
    private readonly image: CaptchaImage,
  ) {}

  /**
   * `text` is the answer, for dev tooling only: an app route sends `token` and `svg`, never `text`.
   */
  async execute(input: IssueCaptchaInput): Promise<{ token: string; svg: string; text: string }> {
    const { text, svg } = this.image.random(input.length);
    const { token } = await this.captchas.issue({
      kind: input.kind,
      text,
      mac: input.mac,
      appDeviceId: input.appDeviceId,
      platform: input.platform,
    });
    return { token, svg, text };
  }
}
