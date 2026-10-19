import type { MacAddress } from '../../../../shared/kernel/mac-address.js';

/** `registration`: proves a human before a V4 device is created. `uid_recovery`: proves ownership. */
export type CaptchaPurpose = 'registration' | 'uid_recovery';

/** Short-lived captcha answers in the brand's database (5 minutes). */
export abstract class CaptchaStore {
  /** Stores the expected answer and returns the token the app must send back. Replaces earlier ones of the same purpose for this MAC. */
  abstract create(input: {
    purpose: CaptchaPurpose;
    mac: MacAddress;
    text: string;
  }): Promise<string>;
  /** True (and deletes it) if a live captcha matches token, MAC, purpose and answer (case-insensitive). */
  abstract consume(input: {
    purpose: CaptchaPurpose;
    mac: MacAddress;
    token: string;
    answer: string;
  }): Promise<boolean>;
}

/** Draws captcha images (SVG strings the TV apps display). */
export abstract class CaptchaImages {
  /** A random 4-character registration captcha and its answer. */
  abstract registration(): { text: string; svg: string };
  /** An image showing `uid`, so only someone who can see the device screen can type it back. */
  abstract uidRecovery(uid: string): string;
}
