import { Injectable } from '@nestjs/common';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import type { InvalidCaptchaError } from '../../domain/device.errors.js';
import { Captchas } from '../captchas.js';

export interface AnswerAppCaptchaInput {
  token: string;
  answer: string;
}

/**
 * The old Android app's registration captcha (`android/v3/generate_captcha`): issued with no MAC,
 * as a `web` captcha (a token and a typed answer, deleted once answered), and answered here when a
 * new device logs in. A wrong answer uses it up, so it cannot be guessed at.
 */
@Injectable()
export class AnswerAppCaptchaUseCase {
  constructor(private readonly captchas: Captchas) {}

  async execute(input: AnswerAppCaptchaInput): Promise<Result<void, InvalidCaptchaError>> {
    const answered = await this.captchas.answer({
      token: input.token,
      kind: 'web',
      mac: null,
      answer: input.answer,
    });
    return answered.ok ? ok(undefined) : answered;
  }
}
