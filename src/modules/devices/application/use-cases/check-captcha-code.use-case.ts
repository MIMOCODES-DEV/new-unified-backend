import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import type { InvalidCaptchaError } from '../../domain/device.errors.js';
import { Captchas } from '../captchas.js';

export interface CheckCaptchaCodeInput {
  mac: MacAddress;
  /** What the TV sends: the code it typed once, sent again on every start. */
  code: string;
}

/**
 * DEV-4, CRPlayer-type TV apps: they send a captcha code without a token on every start.
 * - The code of the MAC's solved captcha keeps working, forever.
 * - Otherwise the code answers the MAC's newest open captcha (issued with IssueCaptchaUseCase).
 */
@Injectable()
export class CheckCaptchaCodeUseCase {
  constructor(private readonly captchas: Captchas) {}

  async execute(input: CheckCaptchaCodeInput): Promise<Result<void, InvalidCaptchaError>> {
    if (await this.captchas.isSolvedCode(input.mac, input.code)) return ok(undefined);
    const solved = await this.captchas.answerByMac(input.mac, input.code);
    return solved.ok ? ok(undefined) : solved;
  }
}
