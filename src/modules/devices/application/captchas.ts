import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import {
  CAPTCHA_TTL_MS,
  type Captcha,
  type CaptchaKind,
  hashCaptchaAnswer,
  isCaptchaAnswer,
  isCaptchaOpen,
} from '../domain/captcha.js';
import { InvalidCaptchaError } from '../domain/device.errors.js';
import { CaptchaRepository } from './ports/captcha.repository.js';

export interface NewCaptcha {
  kind: CaptchaKind;
  /** The text to type; only its hash is stored. */
  text: string;
  mac: MacAddress | null;
  appDeviceId: string | null;
  platform: string | null;
}

export interface CaptchaAnswer {
  token: string;
  kind: CaptchaKind;
  /** The MAC the captcha was issued for; a captcha only works for its own MAC. */
  mac: MacAddress | null;
  answer: string;
}

/**
 * Captcha rules (DEV-4), shared by the captcha use cases:
 * - An unanswered captcha expires after CAPTCHA_TTL_MS.
 * - A captcha is answered once: a wrong answer uses it up too, so it cannot be guessed at.
 * - A solved V4 captcha is kept for its MAC: the device skips the next one, and CRPlayer-type apps
 *   send the same solved code on every start. Other kinds are deleted once answered.
 */
@Injectable()
export class Captchas {
  constructor(
    private readonly captchas: CaptchaRepository,
    private readonly clock: Clock,
  ) {}

  /** Stores a new captcha and returns the token the app sends back with its answer. */
  async issue(input: NewCaptcha): Promise<{ token: string }> {
    const now = this.clock.now();
    const captcha: Captcha = {
      id: randomUUID(),
      token: randomUUID(),
      kind: input.kind,
      macAddress: input.mac?.value ?? null,
      appDeviceId: input.appDeviceId,
      platform: input.platform,
      answerHash: hashCaptchaAnswer(input.text),
      verifiedAt: null,
      expiresAt: new Date(now.getTime() + CAPTCHA_TTL_MS),
      createdAt: now,
    };
    await this.captchas.insert(captcha);
    return { token: captcha.token };
  }

  /** Checks an answer and uses the captcha up. One error for every failure, so nothing leaks. */
  async answer(input: CaptchaAnswer): Promise<Result<Captcha, InvalidCaptchaError>> {
    const invalid = () => err(new InvalidCaptchaError('Invalid or expired captcha'));
    const now = this.clock.now();
    const captcha = await this.captchas.findByToken(input.token);
    if (
      !captcha ||
      captcha.kind !== input.kind ||
      captcha.macAddress !== (input.mac?.value ?? null) ||
      !isCaptchaOpen(captcha, now)
    ) {
      return invalid();
    }
    if (!isCaptchaAnswer(captcha, input.answer)) {
      await this.captchas.delete(captcha.id);
      return invalid();
    }
    // Only one of two answers sent at once wins.
    const won =
      captcha.kind === 'v4'
        ? await this.captchas.markSolved(captcha.id, now)
        : await this.captchas.delete(captcha.id);
    return won ? ok(captcha) : invalid();
  }

  /**
   * Old TV apps send only the typed code, no token: it answers the newest open V4 captcha of the
   * MAC. Used up like any answer, so a wrong code cannot be retried on the same captcha.
   */
  async answerByMac(mac: MacAddress, code: string): Promise<Result<Captcha, InvalidCaptchaError>> {
    const open = await this.captchas.findOpen(mac, 'v4', this.clock.now());
    if (!open) return err(new InvalidCaptchaError('Invalid or expired captcha'));
    return this.answer({ token: open.token, kind: 'v4', mac, answer: code });
  }

  /** Whether this MAC solved a V4 captcha before: then it skips the next one. */
  async solvedBefore(mac: MacAddress): Promise<boolean> {
    return (await this.captchas.findSolved(mac, 'v4')) !== null;
  }

  /** Whether `code` is the text of this MAC's solved V4 captcha (sent again on every start). */
  async isSolvedCode(mac: MacAddress, code: string): Promise<boolean> {
    const solved = await this.captchas.findSolved(mac, 'v4');
    return solved !== null && isCaptchaAnswer(solved, code);
  }
}
