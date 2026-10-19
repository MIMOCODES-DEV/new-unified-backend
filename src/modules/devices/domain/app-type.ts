import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidAppTypeError } from './device.errors.js';

const APP_TYPE = /^[a-z0-9_]{1,32}$/;

/** Which app the device runs (`samsung`, `android`, `fire_tv`, `roku`…), normalized to lowercase. */
export class AppType {
  private constructor(readonly value: string) {}

  static parse(input: string): Result<AppType, InvalidAppTypeError> {
    const value = input.trim().toLowerCase();
    if (!APP_TYPE.test(value)) {
      return err(
        new InvalidAppTypeError('App type must be 1-32 lowercase letters, digits or underscores', {
          input,
        }),
      );
    }
    return ok(new AppType(value));
  }

  toString(): string {
    return this.value;
  }
}
