import type {
  DomainMigration,
  MoveConfirmation,
  MoveStatus,
} from '../../domain/domain-migration.js';

/** `domainMigrations` in the central database (shared by every brand). */
export abstract class DomainMigrationRepository {
  abstract findById(id: string): Promise<DomainMigration | null>;
  abstract findByHosts(fromHost: string, toHost: string): Promise<DomainMigration | null>;
  /** Oldest first. */
  abstract listByStatus(status: MoveStatus): Promise<DomainMigration[]>;
  abstract insert(move: DomainMigration): Promise<void>;
  /**
   * Adds one confirmation to the move between these hosts in one write, creating the move from
   * `created` when there is none. `already` when this IP or device confirmed it before.
   */
  abstract confirm(
    created: DomainMigration,
    confirmation: MoveConfirmation,
  ): Promise<'created' | 'confirmed' | 'already'>;
  /** Replaces the stored move; false when it is not there. */
  abstract update(move: DomainMigration): Promise<boolean>;
}
