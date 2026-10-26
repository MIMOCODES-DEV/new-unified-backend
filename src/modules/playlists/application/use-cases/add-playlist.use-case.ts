import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { AddedBy, Playlist } from '../../domain/playlist.js';
import {
  epgUrl,
  playlistContent,
  playlistName,
  type PlaylistSource,
} from '../../domain/playlist-content.js';
import { type InvalidPlaylistError, PlaylistExistsError } from '../../domain/playlist.errors.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface AddPlaylistInput {
  /** The calling device; the route found it first. */
  deviceId: string;
  name: string;
  source: PlaylistSource;
  epgUrl?: string | null;
  addedBy: AddedBy;
}

/**
 * PL-2: adds a playlist to a device. The same playlist (same link, Xtream login, portal or code)
 * cannot be added twice to one device. There is no limit on playlists per device.
 */
@Injectable()
export class AddPlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AddPlaylistInput,
  ): Promise<Result<Playlist, InvalidPlaylistError | PlaylistExistsError>> {
    const name = playlistName(input.name);
    if (!name.ok) return name;
    const content = playlistContent(input.source);
    if (!content.ok) return content;
    const epg = epgUrl(input.epgUrl);
    if (!epg.ok) return epg;

    const now = this.clock.now();
    const playlist: Playlist = {
      id: randomUUID(),
      deviceId: input.deviceId,
      name: name.value,
      ...content.value,
      epgUrl: epg.value,
      backup: { enabled: false, hosts: [] },
      protected: false,
      pinEnc: null,
      provider: null,
      addedBy: input.addedBy,
      legacy: null,
      createdAt: now,
      updatedAt: now,
    };
    if ((await this.playlists.insert(playlist)) === 'duplicate') {
      return err(new PlaylistExistsError('This device already has this playlist'));
    }
    await this.devices.playlistCountChanged(input.deviceId, 1);
    return ok(playlist);
  }
}
