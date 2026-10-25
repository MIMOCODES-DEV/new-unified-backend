import type { MacAddress } from '../../../../shared/kernel/mac-address.js';

/**
 * Runs work while holding the lock for one or more MACs of the current brand, on every server.
 * Throws when the lock cannot be taken (held too long by someone else, or Redis unavailable);
 * the work then does not run.
 */
export abstract class DeviceLock {
  abstract withMacs<T>(macs: readonly MacAddress[], fn: () => Promise<T>): Promise<T>;
}
