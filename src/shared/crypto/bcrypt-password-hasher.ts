import bcrypt from 'bcryptjs';
import { PasswordHasher } from '../kernel/password-hasher.js';

/** The old backends hashed with bcrypt at cost 10; new hashes use 12. */
const COST = 12;

/**
 * bcrypt (pure JavaScript, no native build). Reads the `$2a$` / `$2b$` hashes the old cr site wrote,
 * so moved customers and admins log in with their old passwords.
 */
export class BcryptPasswordHasher extends PasswordHasher {
  hash(password: string): Promise<string> {
    return bcrypt.hash(password, COST);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch {
      return false;
    }
  }
}
