import type { ServedHostMove } from '../../domain/served-host-move.js';

/** A device changed the link of one of its own playlists. */
export interface PlaylistLinkChange {
  readonly deviceId: string;
  readonly ip: string;
  readonly before: string | null;
  readonly after: string | null;
}

/**
 * Provider host moves (the domain-migrations module), bound at the process root
 * (src/module-settings.ts): a module may not import another module.
 */
export abstract class PlaylistHostMoves {
  /** DOM-1: a possible report of a provider move. Never fails the edit that made it. */
  abstract linkChanged(change: PlaylistLinkChange): Promise<void>;
  /** DOM-2: the moves staff approved; playlist replies serve them. */
  abstract approved(): Promise<readonly ServedHostMove[]>;
}
