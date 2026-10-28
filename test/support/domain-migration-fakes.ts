import type { DomainMigrationRepository } from '../../src/modules/domain-migrations/application/ports/domain-migration.repository.js';
import { MoveDevices } from '../../src/modules/domain-migrations/application/ports/move-devices.js';
import type {
  DomainMigration,
  MoveConfirmation,
  MoveStatus,
} from '../../src/modules/domain-migrations/domain/domain-migration.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export class InMemoryDomainMigrationRepository implements DomainMigrationRepository {
  readonly items = new Map<string, DomainMigration>();

  async findById(id: string): Promise<DomainMigration | null> {
    await tick();
    return this.items.get(id) ?? null;
  }
  async findByHosts(fromHost: string, toHost: string): Promise<DomainMigration | null> {
    await tick();
    return (
      [...this.items.values()].find((m) => m.fromHost === fromHost && m.toHost === toHost) ?? null
    );
  }
  async listByStatus(status: MoveStatus): Promise<DomainMigration[]> {
    await tick();
    return [...this.items.values()]
      .filter((m) => m.status === status)
      .sort((a, b) => a.firstSeenAt.getTime() - b.firstSeenAt.getTime());
  }
  async insert(move: DomainMigration): Promise<void> {
    await tick();
    this.items.set(move.id, move);
  }
  /** One step, like the single Mongo update: no tick between the check and the write. */
  async confirm(
    created: DomainMigration,
    confirmation: MoveConfirmation,
  ): Promise<'created' | 'confirmed' | 'already'> {
    await tick();
    const move = [...this.items.values()].find(
      (m) => m.fromHost === created.fromHost && m.toHost === created.toHost,
    );
    if (!move) {
      this.items.set(created.id, {
        ...created,
        confirmations: [confirmation],
        lastConfirmedAt: confirmation.at,
        updatedAt: confirmation.at,
      });
      return 'created';
    }
    if (
      move.confirmations.some(
        (c) => c.ipHash === confirmation.ipHash || c.deviceId === confirmation.deviceId,
      )
    ) {
      return 'already';
    }
    this.items.set(move.id, {
      ...move,
      confirmations: [...move.confirmations, confirmation],
      lastConfirmedAt: confirmation.at,
      updatedAt: confirmation.at,
    });
    return 'confirmed';
  }
  async update(move: DomainMigration): Promise<boolean> {
    await tick();
    if (!this.items.has(move.id)) return false;
    this.items.set(move.id, move);
    return true;
  }
}

/** Paid devices by id; every other device is a trial device. */
export class FakeMoveDevices extends MoveDevices {
  readonly paid = new Set<string>();

  isPaid(deviceId: string): Promise<boolean> {
    return Promise.resolve(this.paid.has(deviceId));
  }
}
