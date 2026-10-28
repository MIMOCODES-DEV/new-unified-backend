/**
 * ACC-2: hashes and checks passwords, for customers and staff alike. The hash is never shown or
 * logged. Hashes moved from the old backends (bcrypt) verify as they are.
 */
export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  /** False for a wrong password and for a hash that cannot be read; never throws for those. */
  abstract verify(password: string, hash: string): Promise<boolean>;
}

/** The rule for a new password: 8 to 128 characters. Old passwords are not re-checked. */
export function isAcceptablePassword(password: string): boolean {
  return password.length >= 8 && password.length <= 128;
}
