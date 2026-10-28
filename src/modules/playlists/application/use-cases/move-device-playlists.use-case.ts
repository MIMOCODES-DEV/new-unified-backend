import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface MoveDevicePlaylistsInput {
  fromDeviceId: string;
  toDeviceId: string;
}

export interface MoveDevicePlaylistsOutput {
  /** Moved to the other device, renamed or not. */
  moved: number;
  /** Moved with a new name, because the other device already had the name. */
  renamed: number;
  /** Deleted, because the other device already had the same playlist (same link, portal or code). */
  dropped: number;
}

/**
 * DEV-7: gives every playlist of one device to another, when a paid device switches to the MAC of
 * a trial device (the new TV). Names stay unique per device: a clash becomes "Name (2)",
 * "Name (3)", …; a playlist the other device already has is not copied twice.
 */
@Injectable()
export class MoveDevicePlaylistsUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly clock: Clock,
  ) {}

  async execute(input: MoveDevicePlaylistsInput): Promise<MoveDevicePlaylistsOutput> {
    const out = { moved: 0, renamed: 0, dropped: 0 };
    const at = this.clock.now();
    for (const playlist of await this.playlists.listByDevice(input.fromDeviceId)) {
      for (let suffix = 1; ; suffix++) {
        const name = suffix === 1 ? playlist.name : `${playlist.name} (${suffix})`;
        const result = await this.playlists.update({
          ...playlist,
          deviceId: input.toDeviceId,
          name,
          updatedAt: at,
        });
        if (result === 'name_taken') continue;
        if (result === 'duplicate') {
          await this.playlists.delete(playlist.id);
          out.dropped++;
        } else if (result === 'updated') {
          out.moved++;
          if (suffix > 1) out.renamed++;
        }
        break;
      }
    }
    return out;
  }
}
