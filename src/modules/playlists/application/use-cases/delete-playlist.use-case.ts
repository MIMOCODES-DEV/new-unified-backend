import { Injectable } from '@nestjs/common';
import type { PlaylistActor } from '../../domain/playlist.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import {
  type PinRequiredError,
  PlaylistNotFoundError,
  type WrongPinError,
} from '../../domain/playlist.errors.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface DeletePlaylistInput {
  deviceId: string;
  playlistId: string;
  /** The dashboard needs the PIN of a protected playlist; the app does not. */
  by: PlaylistActor;
  pin?: string | null;
}

/**
 * PL-2: deletes a playlist of the calling device; another device's playlist is not found. On the
 * dashboard a protected playlist needs its PIN (PL-3).
 */
@Injectable()
export class DeletePlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly pins: PlaylistPins,
  ) {}

  async execute(
    input: DeletePlaylistInput,
  ): Promise<Result<void, PlaylistNotFoundError | PinRequiredError | WrongPinError>> {
    const current = await this.playlists.findById(input.playlistId);
    if (!current || current.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    const allowed = await this.pins.check(current, input.pin, input.by);
    if (!allowed.ok) return allowed;
    // Only the call that really deleted it counts it, when two deletes race.
    if (await this.playlists.delete(current.id)) {
      await this.devices.playlistCountChanged(input.deviceId, -1);
    }
    return ok(undefined);
  }
}
