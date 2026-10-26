import type { Playlist } from '../../domain/playlist.js';

/** The current brand's `playlists`. */
export abstract class PlaylistRepository {
  abstract findById(id: string): Promise<Playlist | null>;
  /** A device's playlists, oldest first. */
  abstract listByDevice(deviceId: string): Promise<Playlist[]>;
  /**
   * Playlists with a link on this host (the link, Xtream server, Stalker portal or its fallback),
   * any port, oldest first; only these devices' when given.
   */
  abstract listOnHost(host: string, deviceIds: readonly string[] | null): Promise<Playlist[]>;
  /** By the old backend's `_id` (`legacy.id`). */
  abstract findByLegacyId(legacyId: string): Promise<Playlist | null>;
  /** `duplicate` when the device already has this playlist (same link, portal or code). */
  abstract insert(playlist: Playlist): Promise<'inserted' | 'duplicate'>;
  /**
   * Replaces the stored playlist: `missing` when it is not there, `duplicate` when the change would
   * make it the same as another playlist of the device.
   */
  abstract update(playlist: Playlist): Promise<'updated' | 'missing' | 'duplicate'>;
  /** False when it was already gone. */
  abstract delete(id: string): Promise<boolean>;
  /** Removes every playlist of a device; returns how many. */
  abstract deleteByDevice(deviceId: string): Promise<number>;
}
