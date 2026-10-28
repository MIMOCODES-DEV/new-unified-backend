import { DomainError } from './domain-error.js';
import { err, ok, type Result } from './result.js';

export class InvalidEmailError extends DomainError {
  readonly code = 'kernel.invalid_email';
}

// One @, something before it, a dot in the domain, no spaces: enough to catch typos. Whether the
// address exists is proved by the verification link, not by a pattern.
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const MAX_LENGTH = 254;

/**
 * An email address, trimmed and lowercased, so `Ana@Example.com ` and `ana@example.com` are the
 * same account everywhere they are compared or stored.
 */
export class EmailAddress {
  private constructor(readonly value: string) {}

  static parse(input: string): Result<EmailAddress, InvalidEmailError> {
    const value = input.trim().toLowerCase();
    if (value.length > MAX_LENGTH || !EMAIL.test(value)) {
      return err(new InvalidEmailError('Invalid email address'));
    }
    return ok(new EmailAddress(value));
  }

  toString(): string {
    return this.value;
  }
}
