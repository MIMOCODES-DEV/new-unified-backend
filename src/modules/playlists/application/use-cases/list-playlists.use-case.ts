import { Injectable } from '@nestjs/common';
import type { Playlist } from '../../domain/playlist.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

/** PL-2: a device's playlists, oldest first. */
@Injectable()
export class ListPlaylistsUseCase {
  constructor(private readonly playlists: PlaylistRepository) {}

  execute(deviceId: string): Promise<Playlist[]> {
    return this.playlists.listByDevice(deviceId);
  }
}
