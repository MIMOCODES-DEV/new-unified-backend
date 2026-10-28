import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { Playlist, PlaylistActor } from '../../domain/playlist.js';
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
  type PinRequiredError,
  PlaylistExistsError,
  PlaylistNameTakenError,
  PlaylistNotFoundError,
  type WrongPinError,
} from '../../domain/playlist.errors.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistHostMoves } from '../ports/playlist-host-moves.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface EditPlaylistInput {
  deviceId: string;
  /** The dashboard needs the PIN of a protected playlist; the app does not. */
  by: PlaylistActor;
  playlistId: string;
  /** Only what is given changes. */
  name?: string;
  source?: PlaylistSource;
  epgUrl?: string | null;
  /** The PIN, when the dashboard changes a protected playlist. */
  pin?: string | null;
  /** A new PIN (4 digits) to protect it or change its PIN; null removes the protection. */
  newPin?: string | null;
  /** Where the edit came from: a new link on another host is reported as a provider move (DOM-1). */
  ip?: string;
}

/** The link a provider move is learned from: an M3U link, or an Xtream playlist's server. */
function providerLink(playlist: Playlist): string | null {
  if (playlist.type === 'm3u') return playlist.url;
  if (playlist.type === 'xtream') return playlist.xtream?.server ?? null;
  return null;
}

/**
 * PL-2: changes a playlist of the calling device: its name, what it points to, its EPG link.
 * Only these fields can change; another device's playlist is reported as not found. On the
 * dashboard a protected playlist needs its PIN, and the edit form can set or remove the PIN in the
 * same write (PL-3). When only the host of its link changed, the edit also reports a provider move
 * (DOM-1); the report never fails the edit.
 */
@Injectable()
export class EditPlaylistUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly pins: PlaylistPins,
    private readonly clock: Clock,
    private readonly hostMoves: PlaylistHostMoves,
  ) {}

  async execute(
    input: EditPlaylistInput,
  ): Promise<
    Result<
      Playlist,
      | PlaylistNotFoundError
      | InvalidPlaylistError
      | InvalidPinError
      | PlaylistExistsError
      | PlaylistNameTakenError
      | PinRequiredError
      | WrongPinError
    >
  > {
    const current = await this.playlists.findById(input.playlistId);
    if (!current || current.deviceId !== input.deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    const allowed = await this.pins.check(current, input.pin, input.by);
    if (!allowed.ok) return allowed;

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
    if (input.newPin !== undefined) {
      const newPin = input.newPin ? input.newPin : null;
      if (newPin !== null && !isValidPlaylistPin(newPin)) {
        return err(new InvalidPinError('A playlist PIN is 4 digits'));
      }
      changed = {
        ...changed,
        protected: newPin !== null,
        pinEnc: newPin === null ? null : await this.pins.encrypt(newPin),
      };
    }

    const saved = await this.playlists.update(changed);
    if (saved === 'duplicate') {
      return err(new PlaylistExistsError('This device already has this playlist'));
    }
    if (saved === 'name_taken') {
      return err(
        new PlaylistNameTakenError('This device already has a playlist with this name', {
          name: changed.name,
        }),
      );
    }
    if (saved === 'missing') {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    if (input.ip && input.source !== undefined && current.type === changed.type) {
      await this.hostMoves.linkChanged({
        deviceId: input.deviceId,
        ip: input.ip,
        before: providerLink(current),
        after: providerLink(changed),
      });
    }
    return ok(changed);
  }
}
