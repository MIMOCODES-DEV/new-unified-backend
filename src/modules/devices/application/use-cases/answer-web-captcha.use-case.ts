import { Injectable } from '@nestjs/common';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import type { InvalidCaptchaError } from '../../domain/device.errors.js';
import { Captchas } from '../captchas.js';

/**
 * The brand site's captcha (kind `web`, no MAC): checks the typed answer and uses the captcha up,
 * right or wrong, so each try needs a new picture.
 */
@Injectable()
export class AnswerWebCaptchaUseCase {
  constructor(private readonly captchas: Captchas) {}

  async execute(input: {
    token: string;
    answer: string;
  }): Promise<Result<void, InvalidCaptchaError>> {
    const answered = await this.captchas.answer({
      token: input.token,
      kind: 'web',
      mac: null,
      answer: input.answer,
    });
    return answered.ok ? ok(undefined) : answered;
  }
}
