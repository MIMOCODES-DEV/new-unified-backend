/**
 * Device captcha rules (proves a real person is in front of a new TV):
 * - One captcha per MAC. Issuing a new one replaces the old one.
 * - A captcha that was never answered expires after 10 minutes.
 * - The answer is compared without caring about upper/lower case.
 * - Once answered correctly it becomes "verified" and never expires: the MAC has proved a real
 *   person set it up, so V4 apps skip the captcha on later launches ("already_verified").
 * - Optional token: if the captcha was issued with one, the answer must come with the same
 *   token, so an old answer can't be replayed against a newer captcha.
 */
const VALID_FOR_MS = 10 * 60 * 1000;

export class DeviceCaptcha {
  private constructor(
    readonly macAddress: string,
    readonly text: string,
    /** null once verified: a verified captcha does not expire. */
    readonly expiresAt: Date | null,
    readonly verifiedAt: Date | null,
    readonly token: string | null = null,
  ) {}

  static issue(
    macAddress: string,
    text: string,
    now: Date,
    token: string | null = null,
  ): DeviceCaptcha {
    return new DeviceCaptcha(macAddress, text, new Date(now.getTime() + VALID_FOR_MS), null, token);
  }

  /** Rebuilds a captcha from storage. Only repositories call this. */
  static restore(props: {
    macAddress: string;
    text: string;
    expiresAt: Date | null;
    verifiedAt: Date | null;
    token: string | null;
  }): DeviceCaptcha {
    return new DeviceCaptcha(
      props.macAddress,
      props.text,
      props.expiresAt,
      props.verifiedAt,
      props.token,
    );
  }

  get isVerified(): boolean {
    return this.verifiedAt !== null;
  }

  /** Is `answer` correct right now? `token` is required if the captcha was issued with one. */
  accepts(answer: string, now: Date, token?: string): boolean {
    if (this.expiresAt && now > this.expiresAt) return false;
    if (this.token && token !== this.token) return false;
    return answer.trim().toUpperCase() === this.text.toUpperCase();
  }

  verify(now: Date): DeviceCaptcha {
    return new DeviceCaptcha(this.macAddress, this.text, null, this.verifiedAt ?? now, this.token);
  }
}
