import { randomInt } from 'node:crypto';
import { DeviceKeyGenerator } from '../application/ports/device-key-generator.js';

export class RandomDeviceKeyGenerator extends DeviceKeyGenerator {
  next(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }
}
