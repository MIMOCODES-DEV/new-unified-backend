/**
 * Captcha use cases:
 * - Issue: draw a new captcha for a MAC (replacing any older one) and return its picture,
 *   plus a token when the app works with one (BobPlayer).
 * - Verify: true if the answer (and token, if any) matches the MAC's captcha; a correct answer
 *   marks it verified, so the same answer keeps working on later launches.
 * - Is verified: has this MAC already passed a captcha? (BobPlayer then skips the captcha.)
 */
import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import { DeviceCaptcha } from '../../domain/device-captcha.js';
import {
  CaptchaImageGenerator,
  CaptchaRepository,
  type CaptchaStyle,
} from '../ports/captcha.ports.js';

export interface IssueCaptchaOptions extends CaptchaStyle {
  withToken: boolean;
}

@Injectable()
export class IssueCaptchaUseCase {
  constructor(
    private readonly captchas: CaptchaRepository,
    private readonly images: CaptchaImageGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(
    rawMac: string,
    options: IssueCaptchaOptions,
  ): Promise<Result<{ svg: string; token: string | null }, InvalidMacAddressError>> {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok) return mac;
    const { text, svg } = this.images.create(options);
    const token = options.withToken ? randomUUID() : null;
    await this.captchas.save(DeviceCaptcha.issue(mac.value.value, text, this.clock.now(), token));
    return ok({ svg, token });
  }
}

@Injectable()
export class VerifyCaptchaUseCase {
  constructor(
    private readonly captchas: CaptchaRepository,
    private readonly clock: Clock,
  ) {}

  async execute(rawMac: string, answer: string, token?: string): Promise<boolean> {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok || !answer) return false;
    const captcha = await this.captchas.findByMac(mac.value);
    const now = this.clock.now();
    if (!captcha?.accepts(answer, now, token)) return false;
    if (!captcha.isVerified) await this.captchas.save(captcha.verify(now));
    return true;
  }
}

@Injectable()
export class IsCaptchaVerifiedUseCase {
  constructor(private readonly captchas: CaptchaRepository) {}

  async execute(rawMac: string): Promise<boolean> {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok) return false;
    return (await this.captchas.findByMac(mac.value))?.isVerified ?? false;
  }
}
