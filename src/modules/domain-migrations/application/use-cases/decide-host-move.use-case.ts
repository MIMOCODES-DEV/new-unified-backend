import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import {
  HostMoveNotFoundError,
  InvalidDeciderError,
} from '../../domain/domain-migration.errors.js';
import { ApprovedMovesCache } from '../approved-moves-cache.js';
import { DomainMigrationRepository } from '../ports/domain-migration.repository.js';
import { summarize, type HostMoveSummary } from './list-host-moves.use-case.js';

export interface DecideHostMoveInput {
  id: string;
  decision: 'approve' | 'block';
  /** The staff user who decides (a name on the CLI until the admin API exists). */
  by: string;
}

/**
 * DOM-2: a staff member approves or blocks a learned move; `status`, `decidedBy` and `decidedAt`
 * record it. Only approved moves change what devices get; a blocked move is never served, however
 * many confirmations it gets. A decision can be changed later the same way. It reaches this
 * server's playlist replies at once and the other servers' within a minute.
 */
@Injectable()
export class DecideHostMoveUseCase {
  constructor(
    private readonly moves: DomainMigrationRepository,
    private readonly cache: ApprovedMovesCache,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: DecideHostMoveInput,
  ): Promise<Result<HostMoveSummary, HostMoveNotFoundError | InvalidDeciderError>> {
    const by = input.by.trim();
    if (!by) return err(new InvalidDeciderError('Say who decides'));
    const move = await this.moves.findById(input.id);
    if (!move) return err(new HostMoveNotFoundError('No such provider move', { id: input.id }));

    const at = this.clock.now();
    const decided = {
      ...move,
      status: input.decision === 'approve' ? ('approved' as const) : ('blocked' as const),
      decidedBy: by,
      decidedAt: at,
      updatedAt: at,
    };
    if (!(await this.moves.update(decided))) {
      return err(new HostMoveNotFoundError('No such provider move', { id: input.id }));
    }
    this.cache.clear();
    return ok(summarize(decided));
  }
}
