import { randomInt } from 'node:crypto';
import { DeviceKeyGenerator } from '../application/ports/device-key-generator.js';

/** 6-digit keys from a secure random source (the old code used Math.random). */
export class RandomDeviceKeyGenerator extends DeviceKeyGenerator {
  next(): string {
    return String(randomInt(100_000, 1_000_000));
  }
}
