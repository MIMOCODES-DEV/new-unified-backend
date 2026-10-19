/**
 * Captcha use cases:
 * - Issue: draw a new captcha for a MAC (replacing any older one) and return its picture.
 * - Verify: true if the answer matches the MAC's captcha; a correct answer marks it verified,
 *   so the same answer keeps working on later launches.
 */
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type InvalidMacAddressError, MacAddress } from '../../../../shared/kernel/mac-address.js';
import { ok, type Result } from '../../../../shared/kernel/result.js';
import { DeviceCaptcha } from '../../domain/device-captcha.js';
import { CaptchaImageGenerator, CaptchaRepository } from '../ports/captcha.ports.js';

@Injectable()
export class IssueCaptchaUseCase {
  constructor(
    private readonly captchas: CaptchaRepository,
    private readonly images: CaptchaImageGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(rawMac: string): Promise<Result<{ svg: string }, InvalidMacAddressError>> {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok) return mac;
    const { text, svg } = this.images.create();
    await this.captchas.save(DeviceCaptcha.issue(mac.value.value, text, this.clock.now()));
    return ok({ svg });
  }
}

@Injectable()
export class VerifyCaptchaUseCase {
  constructor(
    private readonly captchas: CaptchaRepository,
    private readonly clock: Clock,
  ) {}

  async execute(rawMac: string, answer: string): Promise<boolean> {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok || !answer) return false;
    const captcha = await this.captchas.findByMac(mac.value);
    const now = this.clock.now();
    if (!captcha?.accepts(answer, now)) return false;
    if (!captcha.isVerified) await this.captchas.save(captcha.verify(now));
    return true;
  }
}
