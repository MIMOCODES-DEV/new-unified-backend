import { Injectable } from '@nestjs/common';
import type { DomainMigration, MoveStatus } from '../../domain/domain-migration.js';
import { awaitsApproval, confirmationCount } from '../../domain/host-move.js';
import { DomainMigrationRepository } from '../ports/domain-migration.repository.js';

/** A status, or `awaiting`: pending moves confirmed often enough to approve or block. */
export type HostMoveFilter = MoveStatus | 'awaiting';

export interface HostMoveSummary {
  readonly id: string;
  readonly fromHost: string;
  readonly toHost: string;
  readonly toScheme: DomainMigration['toScheme'];
  readonly status: MoveStatus;
  /** One per IP. */
  readonly confirmations: number;
  /** How many brands its devices are in. */
  readonly brands: number;
  readonly awaitsApproval: boolean;
  readonly decidedBy: string | null;
  readonly decidedAt: Date | null;
  readonly firstSeenAt: Date;
  readonly lastConfirmedAt: Date;
}

export function summarize(move: DomainMigration): HostMoveSummary {
  return {
    id: move.id,
    fromHost: move.fromHost,
    toHost: move.toHost,
    toScheme: move.toScheme,
    status: move.status,
    confirmations: confirmationCount(move),
    brands: new Set(move.confirmations.map((c) => c.tenantId)).size,
    awaitsApproval: awaitsApproval(move),
    decidedBy: move.decidedBy,
    decidedAt: move.decidedAt,
    firstSeenAt: move.firstSeenAt,
    lastConfirmedAt: move.lastConfirmedAt,
  };
}

/** DOM-2: the moves staff look at, oldest first. No device or IP is shown, only counts. */
@Injectable()
export class ListHostMovesUseCase {
  constructor(private readonly moves: DomainMigrationRepository) {}

  async execute(filter: HostMoveFilter): Promise<HostMoveSummary[]> {
    const status = filter === 'awaiting' ? 'pending' : filter;
    const moves = await this.moves.listByStatus(status);
    return moves.filter((m) => filter !== 'awaiting' || awaitsApproval(m)).map(summarize);
  }
}
