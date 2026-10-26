import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Playlist } from '../../domain/playlist.js';
import {
  epgUrl,
  playlistContent,
  playlistName,
  type PlaylistSource,
} from '../../domain/playlist-content.js';
import {
  type InvalidPlaylistError,
  PlaylistExistsError,
  PlaylistNotFoundError,
} from '../../domain/playlist.errors.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface EditPlaylistInput {
  deviceId: string;
  playlistId: string;
  /** Only what is given changes. */
  name?: string;
  source?: PlaylistSource;
  epgUrl?: string | null;
}

/**
 * PL-2: changes a playlist of the calling device: its name, what it points to, its EPG link.
 * Only these fields can change; another device's playlist is reported as not found.
 */
@Injectable()
export class EditPlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: EditPlaylistInput,
  ): Promise<Result<Playlist, PlaylistNotFoundError | InvalidPlaylistError | PlaylistExistsError>> {
    const current = await this.playlists.findById(input.playlistId);
    if (!current || current.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }

    let changed: Playlist = { ...current, updatedAt: this.clock.now() };
    if (input.name !== undefined) {
      const name = playlistName(input.name);
      if (!name.ok) return name;
      changed = { ...changed, name: name.value };
    }
    if (input.source !== undefined) {
      const content = playlistContent(input.source);
      if (!content.ok) return content;
      changed = { ...changed, ...content.value };
    }
    if (input.epgUrl !== undefined) {
      const epg = epgUrl(input.epgUrl);
      if (!epg.ok) return epg;
      changed = { ...changed, epgUrl: epg.value };
    }

    const saved = await this.playlists.update(changed);
    if (saved === 'duplicate') {
      return err(new PlaylistExistsError('This device already has this playlist'));
    }
    if (saved === 'missing') {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    return ok(changed);
  }
}
