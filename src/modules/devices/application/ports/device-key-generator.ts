/** Makes new 6-digit device keys. A port so tests can choose the key. */
export abstract class DeviceKeyGenerator {
  abstract next(): string;
}
