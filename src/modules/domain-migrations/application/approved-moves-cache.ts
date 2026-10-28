import { Injectable } from '@nestjs/common';
import type { Scheme } from '../domain/domain-migration.js';

/** An approved move as playlist replies use it. */
export interface ApprovedHostMove {
  readonly fromHost: string;
  readonly toHost: string;
  /** The scheme the new host is reached on; empty keeps the link's own. */
  readonly toScheme: Scheme;
}

/**
 * The approved moves, kept in memory by this server for a minute. A decision made on this server
 * clears it at once; other servers read again within the minute.
 */
@Injectable()
export class ApprovedMovesCache {
  private entry: { moves: readonly ApprovedHostMove[]; until: number } | null = null;

  get(now: number): readonly ApprovedHostMove[] | null {
    return this.entry && now < this.entry.until ? this.entry.moves : null;
  }

  set(moves: readonly ApprovedHostMove[], until: number): void {
    this.entry = { moves, until };
  }

  clear(): void {
    this.entry = null;
  }
}
