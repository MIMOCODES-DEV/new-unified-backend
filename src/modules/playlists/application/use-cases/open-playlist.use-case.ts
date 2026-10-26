import { Injectable } from '@nestjs/common';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Playlist } from '../../domain/playlist.js';
import {
  type PinRequiredError,
  PlaylistNotFoundError,
  type WrongPinError,
} from '../../domain/playlist.errors.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface OpenPlaylistInput {
  deviceId: string;
  playlistId: string;
  pin?: string | null;
}

/** PL-3: a playlist of the device to play; a protected one needs its PIN. */
@Injectable()
export class OpenPlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly pins: PlaylistPins,
  ) {}

  async execute(
    input: OpenPlaylistInput,
  ): Promise<Result<Playlist, PlaylistNotFoundError | PinRequiredError | WrongPinError>> {
    const playlist = await this.playlists.findById(input.playlistId);
    if (!playlist || playlist.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    const allowed = await this.pins.check(playlist, input.pin);
    return allowed.ok ? ok(playlist) : allowed;
  }
}
