import type { MacAddress } from '../../../../shared/kernel/mac-address.js';

/** Produces a fresh MAC for a device that has no usable MAC of its own. Uniqueness is checked on insert. */
export abstract class RandomMacGenerator {
  abstract next(): MacAddress;
}
