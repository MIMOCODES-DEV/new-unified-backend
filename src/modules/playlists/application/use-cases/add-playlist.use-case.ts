import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { AddedBy, Playlist } from '../../domain/playlist.js';
import {
  epgUrl,
  isValidPlaylistPin,
  playlistContent,
  playlistName,
  type PlaylistSource,
} from '../../domain/playlist-content.js';
import {
  InvalidPinError,
  type InvalidPlaylistError,
  PlaylistExistsError,
} from '../../domain/playlist.errors.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface AddPlaylistInput {
  /** The calling device; the route found it first. */
  deviceId: string;
  name: string;
  source: PlaylistSource;
  epgUrl?: string | null;
  /** 4 digits to save it protected (the website's add form and V4 apps send it); else none. */
  pin?: string | null;
  addedBy: AddedBy;
}

/**
 * PL-2: adds a playlist to a device. The same playlist (same link, Xtream login, portal or code)
 * cannot be added twice to one device. There is no limit on playlists per device. With a PIN it is
 * saved protected in the same write, never unprotected first (PL-3).
 */
@Injectable()
export class AddPlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly pins: PlaylistPins,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: AddPlaylistInput,
  ): Promise<Result<Playlist, InvalidPlaylistError | InvalidPinError | PlaylistExistsError>> {
    const name = playlistName(input.name);
    if (!name.ok) return name;
    const content = playlistContent(input.source);
    if (!content.ok) return content;
    const epg = epgUrl(input.epgUrl);
    if (!epg.ok) return epg;
    const pin = input.pin ? input.pin : null;
    if (pin !== null && !isValidPlaylistPin(pin)) {
      return err(new InvalidPinError('A playlist PIN is 4 digits'));
    }

    const now = this.clock.now();
    const playlist: Playlist = {
      id: randomUUID(),
      deviceId: input.deviceId,
      name: name.value,
      ...content.value,
      account: null,
      epgUrl: epg.value,
      backup: { enabled: false, hosts: [] },
      protected: pin !== null,
      pinEnc: pin === null ? null : await this.pins.encrypt(pin),
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
