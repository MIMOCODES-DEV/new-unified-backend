import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidUidError } from './device.errors.js';

const UID = /^[A-Z0-9]{6}$/;

/**
 * The 6-character id a V4 app generates and keeps on the device (`u_id`). Stored uppercase.
 * It proves the request comes from the install that registered the MAC (weakly: it is not secret).
 */
export class Uid {
  private constructor(readonly value: string) {}

  static parse(input: unknown): Result<Uid, InvalidUidError> {
    const value = typeof input === 'string' ? input.trim().toUpperCase() : '';
    if (!UID.test(value)) {
      return err(
        new InvalidUidError('Invalid u_id. Must be exactly 6 alphanumeric characters.', { input }),
      );
    }
    return ok(new Uid(value));
  }

  equals(other: Uid): boolean {
    return this.value === other.value;
  }
}
