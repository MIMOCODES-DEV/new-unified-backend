/**
 * Old-app routes for playlists, same paths and replies as the old backends.
 * - PUT /api/edit_playlist   plain form or JSON {mac_address, id, expiration_date, status, auth,
 *   fetched_at}: the app reports what the provider said about a playlist's account (PL-7).
 *   Only the account status and expiry are kept; every other field is ignored (the old cr route
 *   copied any field it was sent into the playlist).
 */
import { Body, Controller, HttpException, Put, UseFilters } from '@nestjs/common';
import { SyncPlaylistStatusUseCase } from '../../../modules/playlists/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';

type Body = Record<string, unknown> | undefined;

/** The old cr answers, by our error code: [HTTP status, message]. */
const EDIT_ERRORS: Record<string, [number, string]> = {
  'playlists.device_not_found': [404, 'Device not found'],
  'playlists.not_found': [403, "Sorry, you don't have permission"],
  'playlists.invalid_playlist': [400, 'Invalid playlist status'],
};

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class LegacyPlaylistsController {
  constructor(private readonly syncStatus: SyncPlaylistStatusUseCase) {}

  @LegacyDevice()
  @Put('edit_playlist')
  async editPlaylist(@Body() body: Body) {
    const mac = MacAddress.parse(text(body?.mac_address));
    const playlistId = text(body?.id);
    if (!mac.ok || !playlistId || playlistId === 'demo') {
      throw new HttpException(
        {
          status: 'error',
          msg: 'Missing required fields: mac_address and correct id are required',
        },
        400,
      );
    }
    const status = text(body?.status);
    const expires = text(body?.expiration_date);
    const result = await this.syncStatus.execute({
      mac: mac.value,
      playlistId,
      // The app sends "Unknown" when the provider said nothing.
      status: status && status !== 'Unknown' ? status : null,
      expiresAt: expires && expires !== 'null' ? expires : null,
    });
    if (!result.ok) {
      const [httpStatus, msg] = EDIT_ERRORS[result.error.code] ?? [400, 'Invalid Data'];
      throw new HttpException({ status: 'error', msg }, httpStatus);
    }
    return { status: 'success', msg: 'Playlist updated successfully', id: playlistId };
  }
}
