import { Injectable } from '@nestjs/common';
import { Clock } from '../../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { PlaylistAccount } from '../../domain/playlist.js';
import {
  InvalidPlaylistError,
  PlaylistDeviceNotFoundError,
  PlaylistNotFoundError,
} from '../../domain/playlist.errors.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface SyncPlaylistStatusInput {
  mac: MacAddress;
  playlistId: string;
  /** The provider account status the app read, e.g. `Active`. */
  status?: string | null;
  /**
   * When the provider account ends, as the app sends it: Unix seconds (Xtream `exp_date`),
   * milliseconds, or a date text. Null when it never ends.
   */
  expiresAt?: string | number | null;
}

const MAX_STATUS = 32;

/** Unix seconds, milliseconds or a date text; undefined when it cannot be read. */
function readDate(value: string | number): Date | undefined {
  const text = String(value).trim();
  const date = /^\d+$/.test(text)
    ? new Date(Number(text) < 1e12 ? Number(text) * 1000 : Number(text))
    : new Date(text);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * PL-7, the apps' status sync (old cr `PUT edit_playlist`): the app reports what the provider said
 * about the account behind a playlist, for any playlist type. Only `account` changes; nothing else
 * the app sends can reach the playlist (the old route copied any field it was given).
 */
@Injectable()
export class SyncPlaylistStatusUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly clock: Clock,
  ) {}

  async execute(
    input: SyncPlaylistStatusInput,
  ): Promise<
    Result<
      PlaylistAccount,
      PlaylistDeviceNotFoundError | PlaylistNotFoundError | InvalidPlaylistError
    >
  > {
    const deviceId = await this.devices.findIdByMac(input.mac);
    if (!deviceId) return err(new PlaylistDeviceNotFoundError('Device not found'));
    const playlist = await this.playlists.findById(input.playlistId);
    if (!playlist || playlist.deviceId !== deviceId) {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }

    let status = playlist.account?.status ?? null;
    let expiresAt = playlist.account?.expiresAt ?? null;
    if (input.status !== undefined) {
      const text = input.status?.trim() ?? '';
      if (text.length > MAX_STATUS) {
        return err(new InvalidPlaylistError('The status is too long', { field: 'status' }));
      }
      status = text || null;
    }
    if (input.expiresAt !== undefined) {
      const date =
        input.expiresAt === null || input.expiresAt === '' ? null : readDate(input.expiresAt);
      if (date === undefined) {
        return err(
          new InvalidPlaylistError('The expiry date cannot be read', { field: 'expiresAt' }),
        );
      }
      expiresAt = date;
    }

    const now = this.clock.now();
    const account: PlaylistAccount = { status, expiresAt, checkedAt: now };
    const saved = await this.playlists.update({ ...playlist, account, updatedAt: now });
    if (saved !== 'updated') {
      return err(new PlaylistNotFoundError('Playlist not found', { playlistId: input.playlistId }));
    }
    return ok(account);
  }
}
