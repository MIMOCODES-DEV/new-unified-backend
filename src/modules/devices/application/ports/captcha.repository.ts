import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { Captcha, CaptchaKind } from '../../domain/captcha.js';

/** The current brand's `captchas`. */
export abstract class CaptchaRepository {
  abstract findByToken(token: string): Promise<Captcha | null>;
  /** The most recently solved captcha of this kind for a MAC, if any. */
  abstract findSolved(mac: MacAddress, kind: CaptchaKind): Promise<Captcha | null>;
  abstract insert(captcha: Captcha): Promise<void>;
  /** Replaces the stored captcha; false when it is not there (expired and removed). */
  abstract update(captcha: Captcha): Promise<boolean>;
}
