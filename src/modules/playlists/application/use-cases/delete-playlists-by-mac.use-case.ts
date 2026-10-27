import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import { PlaylistDeviceNotFoundError, TooManyRequestsError } from '../../domain/playlist.errors.js';
import { MacOnlyRateLimit } from '../ports/mac-only-rate-limit.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface DeletePlaylistsByMacInput {
  mac: MacAddress;
  /** The caller's IP, for the rate limit. */
  ip: string;
}

/**
 * PL-6: cr's "delete my playlists" by MAC alone, after the route's captcha. It removes the
 * device's playlists but keeps protected ones: knowing a MAC is the weakest proof there is, and
 * the old route let one guessed captcha wipe everything. Rate limited per IP.
 */
@Injectable()
export class DeletePlaylistsByMacUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly limit: MacOnlyRateLimit,
  ) {}

  async execute(
    input: DeletePlaylistsByMacInput,
  ): Promise<
    Result<
      { deleted: number; keptProtected: number },
      TooManyRequestsError | PlaylistDeviceNotFoundError
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

    let deleted = 0;
    let keptProtected = 0;
    for (const playlist of await this.playlists.listByDevice(deviceId)) {
      if (playlist.protected) keptProtected += 1;
      else if (await this.playlists.delete(playlist.id)) deleted += 1;
    }
    if (deleted > 0) await this.devices.playlistCountChanged(deviceId, -deleted);
    return ok({ deleted, keptProtected });
  }
}
