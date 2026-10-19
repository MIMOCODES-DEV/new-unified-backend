import { describe, expect, it } from 'vitest';
import { DeviceCaptcha } from './device-captcha.js';

const NOW = new Date('2026-10-19T10:00:00Z');
const later = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe('DeviceCaptcha', () => {
  it('accepts the right answer in any case', () => {
    const captcha = DeviceCaptcha.issue('aa:bb:cc:dd:ee:ff', 'K7', NOW);

    expect(captcha.accepts('k7', NOW)).toBe(true);
    expect(captcha.accepts(' K7 ', NOW)).toBe(true);
    expect(captcha.accepts('K8', NOW)).toBe(false);
  });

  it('expires 10 minutes after it was issued if nobody answered', () => {
    const captcha = DeviceCaptcha.issue('aa:bb:cc:dd:ee:ff', 'K7', NOW);

    expect(captcha.accepts('K7', later(10))).toBe(true);
    expect(captcha.accepts('K7', later(11))).toBe(false);
  });

  it('never expires once verified: the TV resends the same code on every launch', () => {
    const verified = DeviceCaptcha.issue('aa:bb:cc:dd:ee:ff', 'K7', NOW).verify(later(1));

    expect(verified.isVerified).toBe(true);
    expect(verified.expiresAt).toBeNull();
    expect(verified.accepts('K7', later(60 * 24 * 365))).toBe(true);
  });
});
