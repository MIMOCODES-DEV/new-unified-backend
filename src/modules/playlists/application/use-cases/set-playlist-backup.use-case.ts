import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { backupHosts } from '../../domain/backup-hosts.js';
import type { PlaylistActor, PlaylistBackup } from '../../domain/playlist.js';
import {
  type InvalidPlaylistError,
  type PinRequiredError,
  PlaylistNotFoundError,
  type WrongPinError,
} from '../../domain/playlist.errors.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface SetPlaylistBackupInput {
  deviceId: string;
  playlistId: string;
  /** The dashboard needs the PIN of a protected playlist; the app does not. */
  by: PlaylistActor;
  pin?: string | null;
  /** Whether the apps use the backups. Turning it off keeps the hosts. */
  enabled: boolean;
  /** The hosts to store; left out, the stored ones stay. */
  hosts?: readonly string[];
}

/**
 * PL-5: a playlist's backup hosts (cr's Cross-DNS backup): up to 8 mirrors of its server that the
 * apps try when it is down. Turning backups off keeps the hosts, so turning them on again does not
 * lose what was typed.
 */
@Injectable()
export class SetPlaylistBackupUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly pins: PlaylistPins,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SetPlaylistBackupInput,
  ): Promise<
    Result<
      PlaylistBackup,
      PlaylistNotFoundError | InvalidPlaylistError | PinRequiredError | WrongPinError
    >
  > {
    const current = await this.playlists.findById(input.playlistId);
    if (!current || current.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    const allowed = await this.pins.check(current, input.pin, input.by);
    if (!allowed.ok) return allowed;

    let hosts = current.backup.hosts;
    if (input.hosts !== undefined) {
      const checked = backupHosts(input.hosts);
      if (!checked.ok) return checked;
      hosts = checked.value;
    }
    const backup: PlaylistBackup = { enabled: input.enabled, hosts };
    const saved = await this.playlists.update({ ...current, backup, updatedAt: this.clock.now() });
    if (saved !== 'updated') {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    return ok(backup);
  }
}
