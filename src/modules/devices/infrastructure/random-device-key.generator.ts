import { randomInt } from 'node:crypto';
import { DeviceKeyGenerator } from '../application/ports/device-key-generator.js';

/** 100000–999999, as the old backends made them: no leading zero for apps that read it as a number. */
export class RandomDeviceKeyGenerator extends DeviceKeyGenerator {
  next(): string {
    return randomInt(100_000, 1_000_000).toString();
  }
}
