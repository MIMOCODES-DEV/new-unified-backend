import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidTenantSecretError } from './tenant.errors.js';

// Dotted camelCase segments, grouped by owner: `store.key`, `legacy.androidAesSecret`, `paypal.clientSecret`.
const SECRET_NAME = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*){0,4}$/;
const MAX_LENGTH = 100;

/** The name of a brand secret. Values are never part of the name, logs or errors. */
export class SecretName {
  private constructor(readonly value: string) {}

  static parse(input: string): Result<SecretName, InvalidTenantSecretError> {
    const value = input.trim();
    if (value.length > MAX_LENGTH || !SECRET_NAME.test(value)) {
      return err(
        new InvalidTenantSecretError(
          'Secret names are dotted camelCase words, e.g. store.key or paypal.clientSecret',
          { name: input },
        ),
      );
    }
    return ok(new SecretName(value));
  }

  toString(): string {
    return this.value;
  }
}
