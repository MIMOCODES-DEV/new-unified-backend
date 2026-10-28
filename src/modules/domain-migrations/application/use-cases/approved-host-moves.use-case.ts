import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { type ApprovedHostMove, ApprovedMovesCache } from '../approved-moves-cache.js';
import { DomainMigrationRepository } from '../ports/domain-migration.repository.js';

/** Playlist replies read the list on every call; another server's decision reaches them within this. */
const CACHE_MS = 60_000;

/**
 * DOM-2: the approved moves, served in playlist replies. Kept in memory for a minute, so a playlist
 * reply adds no database read.
 */
@Injectable()
export class ApprovedHostMovesUseCase {
  constructor(
    private readonly moves: DomainMigrationRepository,
    private readonly cache: ApprovedMovesCache,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<readonly ApprovedHostMove[]> {
    const now = this.clock.now().getTime();
    const cached = this.cache.get(now);
    if (cached) return cached;
    const approved = (await this.moves.listByStatus('approved')).map((m) => ({
      fromHost: m.fromHost,
      toHost: m.toHost,
      toScheme: m.toScheme,
    }));
    this.cache.set(approved, now + CACHE_MS);
    return approved;
  }
}
