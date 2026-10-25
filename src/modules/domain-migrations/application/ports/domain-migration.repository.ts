import type { DomainMigration, MoveStatus } from '../../domain/domain-migration.js';

/** `domainMigrations` in the central database (shared by every brand). */
export abstract class DomainMigrationRepository {
  abstract findById(id: string): Promise<DomainMigration | null>;
  abstract findByHosts(fromHost: string, toHost: string): Promise<DomainMigration | null>;
  /** Oldest first. */
  abstract listByStatus(status: MoveStatus): Promise<DomainMigration[]>;
  abstract insert(move: DomainMigration): Promise<void>;
  /** Replaces the stored move; false when it is not there. */
  abstract update(move: DomainMigration): Promise<boolean>;
}
