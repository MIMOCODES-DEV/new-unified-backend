import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { isValidPlaylistPin } from '../../domain/playlist-content.js';
import {
  InvalidPinError,
  PinRequiredError,
  PlaylistNotFoundError,
  WrongPinError,
} from '../../domain/playlist.errors.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface SetPlaylistPinInput {
  deviceId: string;
  playlistId: string;
  /** 4 digits to protect the playlist (or change its PIN); null to remove the protection. */
  pin: string | null;
  /** The PIN it has now; needed when it is already protected. */
  currentPin?: string | null;
}

/**
 * PL-3: protects a playlist with a PIN, changes the PIN, or removes the protection. Changing or
 * removing it needs the current PIN. The PIN is stored encrypted with the brand's key.
 */
@Injectable()
export class SetPlaylistPinUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly pins: PlaylistPins,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SetPlaylistPinInput,
  ): Promise<
    Result<
      { protected: boolean },
      PlaylistNotFoundError | InvalidPinError | PinRequiredError | WrongPinError
    >
  > {
    if (input.pin !== null && !isValidPlaylistPin(input.pin)) {
      return err(new InvalidPinError('A playlist PIN is 4 digits'));
    }
    const current = await this.playlists.findById(input.playlistId);
    if (!current || current.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    const allowed = await this.pins.check(current, input.currentPin);
    if (!allowed.ok) return allowed;

    const isProtected = input.pin !== null;
    const saved = await this.playlists.update({
      ...current,
      protected: isProtected,
      pinEnc: input.pin === null ? null : await this.pins.encrypt(input.pin),
      updatedAt: this.clock.now(),
    });
    if (saved !== 'updated') {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    return ok({ protected: isProtected });
  }
}
