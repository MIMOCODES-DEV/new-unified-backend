/** Letters and digits that cannot be misread: no I, O, S, 0 or 1 (as the old backends). */
export const RECOVERY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';
export const RECOVERY_CODE_LENGTH = 8;
/** A recovery code works for 30 minutes after the website makes it. */
export const RECOVERY_CODE_TTL_MS = 30 * 60 * 1000;

/**
 * A recovery code as typed (any case, spaces around it), in its stored form; null when it cannot be
 * a recovery code at all.
 */
export function normalizeRecoveryCode(typed: string): string | null {
  const code = typed.trim().toUpperCase();
  if (code.length !== RECOVERY_CODE_LENGTH) return null;
  return [...code].every((c) => RECOVERY_CODE_ALPHABET.includes(c)) ? code : null;
}
