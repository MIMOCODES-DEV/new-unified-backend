import { randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { RandomMacGenerator } from '../application/ports/random-mac.generator.js';

/**
 * Random locally administered unicast MACs (first byte 0x02-style: bit 1 set, bit 0 clear), so they
 * can never collide with a real vendor MAC a device might report later.
 */
@Injectable()
export class CryptoRandomMacGenerator extends RandomMacGenerator {
  next(): MacAddress {
    const bytes = randomBytes(6);
    bytes[0] = ((bytes[0] ?? 0) & 0xfc) | 0x02;
    const mac = MacAddress.parse(bytes.toString('hex'));
    if (!mac.ok) throw mac.error; // 12 hex chars always parse
    return mac.value;
  }
}
