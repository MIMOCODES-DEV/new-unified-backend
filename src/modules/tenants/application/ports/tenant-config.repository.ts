/** Where a brand's own database is. */
export interface TenantDbRef {
  readonly id: string;
  readonly dbName: string;
}

/** The `tenantConfig` document in each brand's database, unvalidated: use cases parse it. */
export abstract class TenantConfigRepository {
  /** The stored config values, or null when the brand has none yet. */
  abstract load(tenant: TenantDbRef): Promise<unknown>;
  abstract save(tenant: TenantDbRef, config: object, now: Date): Promise<void>;
}
