import { createHash, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { DomainMigration } from '../../domain/domain-migration.js';
import { awaitsApproval, hostMoveBetween, type HostMove } from '../../domain/host-move.js';
import { DomainMigrationRepository } from '../ports/domain-migration.repository.js';
import { MoveDevices } from '../ports/move-devices.js';

export interface ReportHostMoveInput {
  /** The brand the device is in. */
  tenantId: string;
  deviceId: string;
  /** Where the edit came from; only a hash of it is stored. */
  ip: string;
  /** The playlist's link before and after the device's own edit. */
  before: string | null;
  after: string | null;
}

export type ReportHostMoveOutcome =
  /** Not a move (more than the host changed), or not from a paid device: nothing stored. */
  | { readonly recorded: false; readonly reason: 'not_a_move' | 'not_paid' }
  | {
      readonly recorded: true;
      readonly move: HostMove;
      /** `already` when this IP or device confirmed the move before (it counts once). */
      readonly result: 'created' | 'confirmed' | 'already';
      /** The move now waits for a staff member to approve or block it. */
      readonly awaitsApproval: boolean;
    };

const ipHash = (ip: string) => createHash('sha256').update(ip).digest('hex');

/**
 * DOM-1: learns provider host moves from devices. When a device changes its own playlist's link and
 * only the host changed, that is one report of the move. Only paid devices count, once per IP and
 * once per device; the first report creates a `pending` move. After 3 confirmations from different
 * IPs it shows up for approval; it is served only once approved (DOM-2), and never when blocked.
 */
@Injectable()
export class ReportHostMoveUseCase {
  constructor(
    private readonly moves: DomainMigrationRepository,
    private readonly devices: MoveDevices,
    private readonly clock: Clock,
  ) {}

  async execute(input: ReportHostMoveInput): Promise<ReportHostMoveOutcome> {
    const move = hostMoveBetween(input.before, input.after);
    if (!move) return { recorded: false, reason: 'not_a_move' };
    if (!(await this.devices.isPaid(input.deviceId))) {
      return { recorded: false, reason: 'not_paid' };
    }

    const at = this.clock.now();
    const created: DomainMigration = {
      id: randomUUID(),
      kind: 'migration',
      ...move,
      confirmations: [],
      source: 'user',
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      firstSeenAt: at,
      lastConfirmedAt: at,
      legacy: null,
      createdAt: at,
      updatedAt: at,
    };
    const result = await this.moves.confirm(created, {
      tenantId: input.tenantId,
      deviceId: input.deviceId,
      ipHash: ipHash(input.ip),
      at,
    });
    const stored = await this.moves.findByHosts(move.fromHost, move.toHost);
    return {
      recorded: true,
      move,
      result,
      awaitsApproval: stored ? awaitsApproval(stored) : false,
    };
  }
}
