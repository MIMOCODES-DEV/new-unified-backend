/** `v4` = V4 registration, `uidRecovery` = the u_id did not match, `web` = the website. */
export const CAPTCHA_KINDS = ['v4', 'uidRecovery', 'web'] as const;
export type CaptchaKind = (typeof CAPTCHA_KINDS)[number];

/**
 * One captcha shown to a device. An unanswered captcha expires; a solved one is kept for its MAC,
 * because CRPlayer-type apps send the same solved code on every start.
 */
export interface Captcha {
  readonly id: string;
  /** What the app sends back with its answer; unique. */
  readonly token: string;
  readonly kind: CaptchaKind;
  readonly macAddress: string | null;
  readonly appDeviceId: string | null;
  readonly platform: string | null;
  /** Hash of the upper-case text shown; the answer itself is never stored. */
  readonly answerHash: string;
  /** Set once, when solved. */
  readonly verifiedAt: Date | null;
  /** Cleared when solved, so the TTL index keeps the solved row. */
  readonly expiresAt: Date | null;
  readonly createdAt: Date;
}
