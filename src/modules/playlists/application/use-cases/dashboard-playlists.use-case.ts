import { Injectable } from '@nestjs/common';
import type { Playlist, PlaylistType } from '../../domain/playlist.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

/** A protected playlist on the dashboard: only what lets the person pick it and enter the PIN. */
export interface HiddenPlaylist {
  readonly id: string;
  readonly name: string;
  readonly type: PlaylistType;
  readonly protected: true;
  readonly hidden: true;
}

/**
 * PL-3: a device's playlists for the website dashboard. A protected playlist shows only its name
 * and type; its link, login, portal, code, EPG and provider stay hidden until it is unlocked with
 * its PIN (UnlockPlaylistUseCase).
 */
@Injectable()
export class DashboardPlaylistsUseCase {
  constructor(private readonly playlists: PlaylistRepository) {}

  async execute(deviceId: string): Promise<(Playlist | HiddenPlaylist)[]> {
    return (await this.playlists.listByDevice(deviceId)).map((p) =>
      p.protected ? { id: p.id, name: p.name, type: p.type, protected: true, hidden: true } : p,
    );
  }
}
