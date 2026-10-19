/**
 * Device captcha rules (proves a real person is in front of a new TV):
 * - One captcha per MAC. Issuing a new one replaces the old one.
 * - A captcha that was never answered expires after 10 minutes.
 * - The answer is compared without caring about upper/lower case.
 * - Once answered correctly it becomes "verified" and never expires: CRPlayer sends the same
 *   code on every launch, so the code works like that TV's password (old cr behaviour).
 */
const VALID_FOR_MS = 10 * 60 * 1000;

export class DeviceCaptcha {
  private constructor(
    readonly macAddress: string,
    readonly text: string,
    /** null once verified: a verified captcha does not expire. */
    readonly expiresAt: Date | null,
    readonly verifiedAt: Date | null,
  ) {}

  static issue(macAddress: string, text: string, now: Date): DeviceCaptcha {
    return new DeviceCaptcha(macAddress, text, new Date(now.getTime() + VALID_FOR_MS), null);
  }

  /** Rebuilds a captcha from storage. Only repositories call this. */
  static restore(props: {
    macAddress: string;
    text: string;
    expiresAt: Date | null;
    verifiedAt: Date | null;
  }): DeviceCaptcha {
    return new DeviceCaptcha(props.macAddress, props.text, props.expiresAt, props.verifiedAt);
  }

  get isVerified(): boolean {
    return this.verifiedAt !== null;
  }

  /** Is `answer` correct right now? */
  accepts(answer: string, now: Date): boolean {
    if (this.expiresAt && now > this.expiresAt) return false;
    return answer.trim().toUpperCase() === this.text.toUpperCase();
  }

  verify(now: Date): DeviceCaptcha {
    return new DeviceCaptcha(this.macAddress, this.text, null, this.verifiedAt ?? now);
  }
}
