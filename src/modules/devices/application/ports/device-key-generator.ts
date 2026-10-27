/** Makes new device keys: 6 random digits, not unique (always checked with the MAC). */
export abstract class DeviceKeyGenerator {
  abstract next(): string;
}
