import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, type Result } from '../../../../shared/kernel/result.js';
import type { Playlist } from '../../domain/playlist.js';
import type { PlaylistSource } from '../../domain/playlist-content.js';
import {
  type InvalidPinError,
  type InvalidPlaylistError,
  PlaylistDeviceNotFoundError,
  type PlaylistExistsError,
  TooManyRequestsError,
} from '../../domain/playlist.errors.js';
import { MacOnlyRateLimit } from '../ports/mac-only-rate-limit.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';

export interface AddPlaylistByMacInput {
  /** The TV's MAC: from the QR code the TV shows, or typed on the website form. */
  mac: MacAddress;
  /** The caller's IP, for the rate limit. */
  ip: string;
  name: string;
  source: PlaylistSource;
  epgUrl?: string | null;
  pin?: string | null;
}

/**
 * PL-6: adds a playlist to a known device without a login: the QR code page, the Stalker form and
 * cr's add-by-MAC form. The route checks its captcha first (a `web` captcha issued for this MAC).
 * Each IP may call it a limited number of times, whatever the outcome, so MACs cannot be probed.
 */
@Injectable()
export class AddPlaylistByMacUseCase {
  constructor(
    private readonly devices: PlaylistDevices,
    private readonly limit: MacOnlyRateLimit,
    private readonly add: AddPlaylistUseCase,
  ) {}

  async execute(
    input: AddPlaylistByMacInput,
  ): Promise<
    Result<
      Playlist,
      | TooManyRequestsError
      | PlaylistDeviceNotFoundError
      | InvalidPlaylistError
      | InvalidPinError
      | PlaylistExistsError
    >
  > {
    const decision = await this.limit.take(input.ip);
    if (!decision.allowed) {
      return err(
        new TooManyRequestsError('Too many attempts; try again later', {
          retryAfterMs: decision.retryAfterMs,
        }),
      );
    }
    const deviceId = await this.devices.findIdByMac(input.mac);
    if (!deviceId) return err(new PlaylistDeviceNotFoundError('Device not found'));
    return this.add.execute({
      deviceId,
      name: input.name,
      source: input.source,
      epgUrl: input.epgUrl,
      pin: input.pin,
      addedBy: { via: 'website', resellerId: null },
    });
  }
}
