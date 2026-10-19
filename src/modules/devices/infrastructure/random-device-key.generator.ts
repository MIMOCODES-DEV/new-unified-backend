import { randomInt } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { DeviceKeyGenerator } from '../application/ports/device-key.generator.js';

/** 6-digit keys from 100000 to 999999 (old apps expect a 6-digit number), from a CSPRNG. */
@Injectable()
export class RandomDeviceKeyGenerator extends DeviceKeyGenerator {
  next(): string {
    return String(randomInt(100_000, 1_000_000));
  }
}
