import { describe, expect, it } from 'vitest';
import { newTotpSecret, totpCode, totpUri, verifyTotp } from './totp.js';

// RFC 6238 appendix B: the SHA-1 key "12345678901234567890", in base32.
const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors (last 6 digits)', () => {
    expect(totpCode(RFC_SECRET, new Date(59 * 1000))).toBe('287082');
    expect(totpCode(RFC_SECRET, new Date(1111111109 * 1000))).toBe('081804');
    expect(totpCode(RFC_SECRET, new Date(1234567890 * 1000))).toBe('005924');
    expect(totpCode(RFC_SECRET, new Date(2000000000 * 1000))).toBe('279037');
  });

  it('accepts the code of the step before and after, not two steps away', () => {
    const at = new Date('2026-10-28T12:00:15Z');
    const secret = newTotpSecret();
    expect(verifyTotp(secret, totpCode(secret, at), at)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, new Date(at.getTime() - 30_000)), at)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, new Date(at.getTime() + 30_000)), at)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, new Date(at.getTime() - 60_000)), at)).toBe(false);
  });

  it('refuses codes that are not 6 digits', () => {
    const secret = newTotpSecret();
    expect(verifyTotp(secret, '12345', new Date())).toBe(false);
    expect(verifyTotp(secret, 'abcdef', new Date())).toBe(false);
  });

  it('makes 32-character base32 secrets and an otpauth link', () => {
    const secret = newTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(totpUri('Unified', 'ana@example.com', secret)).toBe(
      `otpauth://totp/Unified%3Aana%40example.com?secret=${secret}&issuer=Unified&digits=6&period=30`,
    );
  });
});
