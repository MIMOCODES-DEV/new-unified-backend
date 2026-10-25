/** "This brand's secrets/config changed": tells every process to drop what it cached. */
export interface TenantChangeEvent {
  readonly kind: 'secrets' | 'config';
  readonly tenantId: string;
}

/**
 * Change notices between processes (API instances, worker, CLI). Publishing never fails the
 * caller: a lost notice only delays the change until caches expire.
 */
export abstract class TenantChangeBus {
  abstract publish(event: TenantChangeEvent): Promise<void>;
  abstract subscribe(listener: (event: TenantChangeEvent) => void): void;
}
