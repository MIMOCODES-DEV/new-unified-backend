import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { PlaylistNotFoundError } from '../../domain/playlist.errors.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface DeletePlaylistInput {
  deviceId: string;
  playlistId: string;
}

/** PL-2: deletes a playlist of the calling device; another device's playlist is not found. */
@Injectable()
export class DeletePlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
  ) {}

  async execute(input: DeletePlaylistInput): Promise<Result<void, PlaylistNotFoundError>> {
    const current = await this.playlists.findById(input.playlistId);
    if (!current || current.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    // Only the call that really deleted it counts it, when two deletes race.
    if (await this.playlists.delete(current.id)) {
      await this.devices.playlistCountChanged(input.deviceId, -1);
    }
    return ok(undefined);
  }
}
