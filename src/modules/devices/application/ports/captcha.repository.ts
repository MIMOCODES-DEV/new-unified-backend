import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { Captcha, CaptchaKind } from '../../domain/captcha.js';

/** The current brand's `captchas`. */
export abstract class CaptchaRepository {
  abstract findByToken(token: string): Promise<Captcha | null>;
  /** The most recently solved captcha of this kind for a MAC, if any. */
  abstract findSolved(mac: MacAddress, kind: CaptchaKind): Promise<Captcha | null>;
  /** The newest captcha of this kind for a MAC that is not solved and not expired at `now`. */
  abstract findOpen(mac: MacAddress, kind: CaptchaKind, now: Date): Promise<Captcha | null>;
  abstract insert(captcha: Captcha): Promise<void>;
  /** Replaces the stored captcha; false when it is not there (expired and removed). */
  abstract update(captcha: Captcha): Promise<boolean>;
  /**
   * Marks an unsolved captcha solved and clears its expiry, so it is kept. False when it was
   * already solved or is gone: only one answer ever wins.
   */
  abstract markSolved(id: string, at: Date): Promise<boolean>;
  /** False when it was already gone: only one caller ever deletes it. */
  abstract delete(id: string): Promise<boolean>;
}
