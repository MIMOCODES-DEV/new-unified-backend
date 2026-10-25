import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { TenantConfig } from './tenant-config.js';
import { TenantChangeBus } from './ports/tenant-change.bus.js';

interface Entry<V> {
  value: V;
  expiresAt: number;
}

/**
 * Per-process cache of brand data. A change made by any process empties the brand's entries
 * everywhere (TenantChangeBus); the TTL only bounds staleness if a change notice is lost.
 */
export class TenantMemoryCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly clock: Clock,
    private readonly ttlMs: number,
  ) {}

  get(tenantId: string, key = ''): V | undefined {
    const entry = this.entries.get(this.key(tenantId, key));
    if (!entry || entry.expiresAt <= this.clock.now().getTime()) return undefined;
    return entry.value;
  }

  /** Current generation of a brand's entries. Read it before loading a value, pass it to `set`. */
  generation(tenantId: string): number {
    return this.generations.get(tenantId) ?? 0;
  }

  /** Stores a value unless the brand changed since `generation` (the loaded value may be stale). */
  set(tenantId: string, key: string, value: V, generation: number): void {
    if (generation !== this.generation(tenantId)) return;
    this.entries.set(this.key(tenantId, key), {
      value,
      expiresAt: this.clock.now().getTime() + this.ttlMs,
    });
  }

  invalidate(tenantId: string): void {
    this.generations.set(tenantId, this.generation(tenantId) + 1);
    const prefix = this.key(tenantId, '');
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
  }

  private key(tenantId: string, key: string): string {
    return `${tenantId}\u0000${key}`;
  }
}

const TTL_MS = 5 * 60_000;

/** Decrypted brand secrets by name (`null` = not set). Never logged or returned by an API. */
@Injectable()
export class TenantSecretCache extends TenantMemoryCache<string | null> {
  constructor(clock: Clock, bus: TenantChangeBus) {
    super(clock, TTL_MS);
    bus.subscribe((event) => {
      if (event.kind === 'secrets') this.invalidate(event.tenantId);
    });
  }
}

/** Each brand's effective config. */
@Injectable()
export class TenantConfigCache extends TenantMemoryCache<TenantConfig> {
  constructor(clock: Clock, bus: TenantChangeBus) {
    super(clock, TTL_MS);
    bus.subscribe((event) => {
      if (event.kind === 'config') this.invalidate(event.tenantId);
    });
  }
}
