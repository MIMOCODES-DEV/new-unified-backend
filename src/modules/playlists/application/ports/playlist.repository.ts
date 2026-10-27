import type { Playlist } from '../../domain/playlist.js';

/** The current brand's `playlists`. */
export abstract class PlaylistRepository {
  abstract findById(id: string): Promise<Playlist | null>;
  /** A device's playlists, oldest first. */
  abstract listByDevice(deviceId: string): Promise<Playlist[]>;
  /** By the old backend's `_id` (`legacy.id`). */
  abstract findByLegacyId(legacyId: string): Promise<Playlist | null>;
  abstract insert(playlist: Playlist): Promise<void>;
  /** Replaces the stored playlist; false when it is not there. */
  abstract update(playlist: Playlist): Promise<boolean>;
  /** False when it was already gone. */
  abstract delete(id: string): Promise<boolean>;
  /** Removes every playlist of a device; returns how many. */
  abstract deleteByDevice(deviceId: string): Promise<number>;
}
