import { Injectable } from '@nestjs/common';
import { PlaylistRepository } from '../ports/playlist.repository.js';

/**
 * REC-3 and LIC-4: removes every playlist of a device that is going away (the new TV's trial device
 * after a recovery, a stale trial device in the cleanup), so no orphans are left. Returns how many.
 */
@Injectable()
export class DeleteDevicePlaylistsUseCase {
  constructor(private readonly playlists: PlaylistRepository) {}

  execute(deviceId: string): Promise<number> {
    return this.playlists.deleteByDevice(deviceId);
  }
}
