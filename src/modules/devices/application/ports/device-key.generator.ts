/** Produces candidate 6-digit device keys. Uniqueness is checked by the repository. */
export abstract class DeviceKeyGenerator {
  abstract next(): string;
}
