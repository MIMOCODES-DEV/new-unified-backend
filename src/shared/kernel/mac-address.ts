import { DomainError } from './domain-error.js';
import { err, ok, type Result } from './result.js';

export class InvalidMacAddressError extends DomainError {
  readonly code = 'kernel.invalid_mac_address';
}

/**
 * 12 letters or digits. Real MACs are hex, but some apps make one up with other letters
 * (the Flutter app's `FL:…`), and the old backends accepted any text.
 */
const MAC_12 = /^[0-9a-z]{12}$/;

/**
 * A MAC address normalized to lowercase, colon-separated form (`aa:bb:cc:dd:ee:ff`).
 * `AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff` and `aabbccddeeff` all become the same value,
 * so one device can never be stored as several records.
 */
export class MacAddress {
  private constructor(readonly value: string) {}

  static parse(input: string): Result<MacAddress, InvalidMacAddressError> {
    const chars = input
      .trim()
      .toLowerCase()
      .replace(/[:\-.]/g, '');
    if (!MAC_12.test(chars)) {
      return err(new InvalidMacAddressError('Invalid MAC address', { input }));
    }
    return ok(new MacAddress(chars.match(/.{2}/g)!.join(':')));
  }

  equals(other: MacAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
