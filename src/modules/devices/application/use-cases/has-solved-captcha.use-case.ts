import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { Captchas } from '../captchas.js';

/** DEV-4: whether this MAC solved a V4 captcha before; then the app skips the captcha screen. */
@Injectable()
export class HasSolvedCaptchaUseCase {
  constructor(private readonly captchas: Captchas) {}

  execute(mac: MacAddress): Promise<boolean> {
    return this.captchas.solvedBefore(mac);
  }
}
