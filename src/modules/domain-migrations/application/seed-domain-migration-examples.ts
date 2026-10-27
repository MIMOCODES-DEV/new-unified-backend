import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { DomainMigration, MoveConfirmation } from '../domain/domain-migration.js';
import { DomainMigrationRepository } from './ports/domain-migration.repository.js';

const DAY = 24 * 60 * 60_000;
const ipHash = (ip: string) => createHash('sha256').update(ip).digest('hex');

/**
 * Example provider moves for local development (`pnpm cli seed:examples`), one per status, in the
 * central database. Running it again refreshes the same rows.
 */
@Injectable()
export class SeedDomainMigrationExamples {
  constructor(
    private readonly moves: DomainMigrationRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ domainMigrations: number }> {
    const examples = moveExamples(this.clock.now());
    for (const move of examples) {
      if (await this.moves.findById(move.id)) await this.moves.update(move);
      else await this.moves.insert(move);
    }
    return { domainMigrations: examples.length };
  }
}

function moveExamples(now: Date): DomainMigration[] {
  const ago = (days: number) => new Date(now.getTime() - days * DAY);
  const confirmations = (n: number): MoveConfirmation[] =>
    Array.from({ length: n }, (_, i) => ({
      tenantId: 'example-brand',
      deviceId: `example-paid-device-${i + 1}`,
      ipHash: ipHash(`203.0.113.${20 + i}`),
      at: ago(n - i),
    }));
  const move = (
    m: Partial<DomainMigration> & Pick<DomainMigration, 'id' | 'fromHost' | 'toHost'>,
  ): DomainMigration => ({
    kind: 'migration',
    fromScheme: 'http',
    toScheme: 'http',
    confirmations: [],
    source: 'user',
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    firstSeenAt: ago(5),
    lastConfirmedAt: ago(1),
    legacy: null,
    createdAt: ago(5),
    updatedAt: now,
    ...m,
  });
  return [
    // Reported by two paid devices: not yet enough to show up for approval (3 needed).
    move({
      id: 'example-move-pending',
      fromHost: 'old-provider-a.example.com:8080',
      toHost: 'new-provider-a.example.com:8080',
      confirmations: confirmations(2),
    }),
    // Approved by staff: playlist replies use the new host.
    move({
      id: 'example-move-approved',
      fromHost: 'old-provider-b.example.com',
      toHost: 'new-provider-b.example.com',
      fromScheme: 'http',
      toScheme: 'https',
      confirmations: confirmations(3),
      status: 'approved',
      decidedBy: 'example-staff-1',
      decidedAt: ago(1),
    }),
    // Blocked by staff: never served, however many reports it gets.
    move({
      id: 'example-move-blocked',
      kind: 'mirror',
      fromHost: 'old-provider-c.example.com',
      toHost: 'suspicious-mirror.example.net',
      confirmations: confirmations(4),
      status: 'blocked',
      decidedBy: 'example-staff-1',
      decidedAt: ago(2),
    }),
  ];
}
