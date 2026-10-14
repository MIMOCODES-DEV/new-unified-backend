import { DomainError } from './domain-error.js';
import { err, ok, type Result } from './result.js';

export class InvalidMacAddressError extends DomainError {
  readonly code = 'kernel.invalid_mac_address';
}

const HEX_12 = /^[0-9a-f]{12}$/;

/**
 * A MAC address normalized to lowercase, colon-separated form (`aa:bb:cc:dd:ee:ff`).
 * `AA-BB-CC-DD-EE-FF`, `aabb.ccdd.eeff` and `aabbccddeeff` all become the same value,
 * so one device can never be stored as several records.
 */
export class MacAddress {
  private constructor(readonly value: string) {}

  static parse(input: string): Result<MacAddress, InvalidMacAddressError> {
    const hex = input
      .trim()
      .toLowerCase()
      .replace(/[:\-.]/g, '');
    if (!HEX_12.test(hex)) {
      return err(new InvalidMacAddressError('Invalid MAC address', { input }));
    }
    return ok(new MacAddress(hex.match(/.{2}/g)!.join(':')));
  }

  equals(other: MacAddress): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
