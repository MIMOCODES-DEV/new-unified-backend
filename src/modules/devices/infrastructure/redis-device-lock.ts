import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { RedisLock } from '../../../shared/redis/redis-lock.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { DeviceLock } from '../application/ports/device-lock.js';

/** Long enough for any device write; the lock frees itself if its holder dies. */
const TTL_MS = 10_000;
/** A second sign-up for the same MAC waits for the first, then finds its device. */
const WAIT_MS = 3_000;

/** Device locks in Redis, one key per brand and MAC: `devices:mac:<brand id>:<mac>`. */
@Injectable()
export class RedisDeviceLock extends DeviceLock {
  constructor(
    private readonly lock: RedisLock,
    private readonly context: TenantContext,
  ) {
    super();
  }

  withMacs<T>(macs: readonly MacAddress[], fn: () => Promise<T>): Promise<T> {
    const tenantId = this.context.current.id;
    // Always taken in the same order, so two callers locking the same pair never wait on each other.
    const keys = [...new Set(macs.map((m) => m.value))]
      .sort()
      .map((mac) => `devices:mac:${tenantId}:${mac}`);
    const run = (i: number): Promise<T> =>
      i === keys.length
        ? fn()
        : this.lock.withLock(keys[i]!, { ttlMs: TTL_MS, waitMs: WAIT_MS }, () => run(i + 1));
    return run(0);
  }
}
