/**
 * Old (pre-V4) app routes that change playlists, same paths and replies as the old backends.
 * - POST update_playlist   {data: <envelope>} {mac_address, playlists: [{id, playlist_name | name,
 *     origin_url | url}], remove_ids} → {data: <envelope>} one line per saved playlist (PL-2 sync)
 * - POST add_playlist      {data: <envelope>} (or a plain form, `legacy.plainBodyAddRemove`)
 *     {mac_address, playlist_name, url | playlist_code, playlist_type, username, password,
 *      portal_name, portal_address, fallback_portal_address, stalker_mac_address}
 *     → {data: <envelope> the playlist, status: "success"}; errors plain with their HTTP status
 * - POST remove_playlist   {data: <envelope>} {mac_address, id} → {data: <envelope>} {status, msg}
 * - POST MBBPj5UwlCmTstXGb/manage/{add,update,delete}_playlist   {data: <AES>, signature}
 *     → plain {status, msg | result}; add with a playlistId updates, update without one adds
 * No token, as before: the MAC names the device. Unlike the old routes, a playlist id only reaches
 * the calling device's own playlists (they moved or deleted anyone's), and the sync answers with
 * the saved values (the old one sent the values from before the change).
 */
import { Body, Controller, HttpCode, HttpException, Post, UseFilters } from '@nestjs/common';
import { FindDeviceUseCase } from '../../../modules/devices/index.js';
import {
  AddPlaylistUseCase,
  DeletePlaylistUseCase,
  EditPlaylistUseCase,
  PlaylistReplyUseCase,
  SyncPlaylistsUseCase,
} from '../../../modules/playlists/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { aesDecrypt } from './cryptojs-aes.js';
import { decodeRequest, encodeResponse } from './ibo-envelope.js';
import { LEGACY_KEYS, LegacyDevices } from './legacy-devices.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';
import { legacyPlaylist } from './legacy-reply.js';
import { sameText, sign } from './legacy-signature.js';

type JsonBody = Record<string, unknown> | undefined;

const SYNC_UNREADABLE = {
  status: 'error',
  msg: 'Sorry, playlist remove faced issue. Data has not been decoded correctly.',
};
const NO_PERMISSION = { status: 'error', msg: "Sorry, you don't have permission" };
const DEVICE_MISSING = {
  status: 'error',
  msg: 'Sorry, device not found, please make sure of the provided MAC address.',
};
const PLAYLIST_MISSING = { status: 'error', result: 'Sorry, we could not find playlist' };
const MANAGE_TYPES = ['general', 'xc', 'stalker', 'code'];

/** A field the apps send as text or as a number. */
const loose = (value: unknown): string =>
  typeof value === 'number' ? String(value) : text(value).trim();

/** The cr item fields of an `add_playlist` reply. */
const ADD_REPLY_FIELDS = [
  'is_protected',
  'id',
  'url',
  'playlist_name',
  'username',
  'password',
  'epg_url',
  'code',
  'whatsapp',
  'email',
  'logo',
  'playlist_type',
  'portal_name',
  'portal_address',
  'origin_type',
  'origin_url',
  'backup_urls',
] as const;

const fail = (status: number, msg: string): never => {
  throw new HttpException({ status: 'error', msg }, status);
};

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class LegacyPlaylistSyncController {
  constructor(
    private readonly devices: LegacyDevices,
    private readonly findDevice: FindDeviceUseCase,
    private readonly sync: SyncPlaylistsUseCase,
    private readonly add: AddPlaylistUseCase,
    private readonly edit: EditPlaylistUseCase,
    private readonly remove: DeletePlaylistUseCase,
    private readonly reply: PlaylistReplyUseCase,
  ) {}

  /** The TV apps' offline sync: what changed on the TV while it could not reach us. */
  @LegacyDevice()
  @Post('update_playlist')
  @HttpCode(200)
  async updatePlaylist(@Body() body: JsonBody) {
    const request = decodeRequest(body?.data);
    if (!request) return SYNC_UNREADABLE;
    const json = request.json;
    const mac = MacAddress.parse(text(json.mac_address));
    if (!mac.ok)
      return { status: 'error', msg: 'Sorry, playlist remove faced issue. MAC Not found.' };
    const reply = (value: unknown) => ({ data: encodeResponse(value, request.key) });

    const items = Array.isArray(json.playlists) ? (json.playlists as unknown[]) : [];
    // The app's own id for each item, sent back as `origin_id` (as sent: CRPlayer uses numbers).
    const appIds: unknown[] = [];
    const playlists = items.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const item = raw as Record<string, unknown>;
      const url = (text(item.origin_url) || text(item.url)).trim();
      if (!url) return [];
      // CRPlayer sends `name`; the old cr route read `playlist_name` and saved no name.
      const name = (text(item.playlist_name) || text(item.name)).trim() || url;
      appIds.push(item.id);
      return [{ originId: loose(item.id) || null, name, url }];
    });
    // CRPlayer marks playlists it never saved as `non_saved…`: nothing to remove for those.
    const removeIds = (Array.isArray(json.remove_ids) ? (json.remove_ids as unknown[]) : [])
      .map(loose)
      .filter((id) => id && !id.includes('non_saved'));

    const synced = await this.sync.execute({
      mac: mac.value,
      playlists,
      removeIds,
      addedBy: { via: 'app', resellerId: null },
    });
    if (!synced.ok) return reply({ status: 'error', msg: 'Sorry, device does not exist' });
    const cr = this.devices.settings().dialect === 'cr';
    // One line per item sent, in order; an item that could not be saved is left out.
    const lines = synced.value.playlists.flatMap((line, index) => {
      if (line.id === null) return [];
      const base = { id: line.id, playlist_name: line.name, url: line.url };
      const originId = appIds[index] ?? line.originId;
      return [
        cr
          ? { ...base, origin_id: originId }
          : {
              ...base,
              username: '',
              password: '',
              playlist_type: 'general',
              origin_url: line.url,
              origin_type: 'general',
              origin_id: originId,
            },
      ];
    });
    return reply(lines);
  }

  @LegacyDevice()
  @Post('add_playlist')
  @HttpCode(200)
  async addPlaylist(@Body() body: JsonBody) {
    const plain = this.devices.settings().plainBodyAddRemove && typeof body?.data !== 'string';
    const request = plain ? null : decodeRequest(body?.data);
    const json = plain ? (body ?? {}) : request?.json;
    if (!json) return fail(400, 'Invalid request data');

    const name = (text(json.playlist_name) || text(json.portal_name)).trim();
    if (!text(json.mac_address) || !name) {
      return fail(400, 'Missing required fields: mac_address and playlist_name are required');
    }
    const type = text(json.playlist_type).trim() || 'general';
    const url = text(json.url).trim();
    const code = loose(json.playlist_code);
    if (type === 'stalker') {
      if (
        !text(json.portal_name) ||
        !text(json.portal_address) ||
        !text(json.stalker_mac_address)
      ) {
        return fail(
          400,
          'For stalker playlist type, portal_name, portal_address and stalker_mac_address are required',
        );
      }
    } else {
      if (!url && !code) return fail(400, 'Either url or playlist_code must be provided');
      if (url && code) return fail(400, 'Please provide either url or playlist_code, but not both');
      if (code && !/^\d+$/.test(code)) return fail(400, 'Code can only contain digits');
    }
    const mac = MacAddress.parse(text(json.mac_address));
    const found = mac.ok ? await this.findDevice.execute(mac.value) : null;
    if (!found?.ok) return fail(404, 'Device not found');
    const device = found.value.device;

    const username = text(json.username).trim();
    const password = text(json.password);
    const source =
      type === 'stalker'
        ? {
            kind: 'stalker' as const,
            portalUrl: text(json.portal_address),
            portalName: text(json.portal_name) || null,
            fallbackUrl: text(json.fallback_portal_address) || null,
            mac: text(json.stalker_mac_address) || null,
          }
        : code
          ? { kind: 'code' as const, code }
          : type === 'xc' && username && password
            ? { kind: 'xtream' as const, server: url, username, password }
            : { kind: 'link' as const, url };
    const added = await this.add.execute({
      deviceId: device.id,
      name,
      source,
      addedBy: { via: 'app', resellerId: null },
    });
    if (!added.ok) {
      return fail(
        500,
        added.error.code === 'playlists.exists'
          ? 'Playlist already exists'
          : 'Invalid playlist data provided',
      );
    }
    if (plain) return { status: 'success', id: added.value.id };
    const saved = await this.savedItem(added.value.id, device);
    const item: Record<string, unknown> = {};
    for (const key of ADD_REPLY_FIELDS) {
      const value = (saved as Record<string, unknown>)[key];
      if (value !== undefined) item[key] = value;
    }
    return { data: encodeResponse(item, request!.key), status: 'success' };
  }

  @LegacyDevice()
  @Post('remove_playlist')
  @HttpCode(200)
  async removePlaylist(@Body() body: JsonBody) {
    const plain = this.devices.settings().plainBodyAddRemove && typeof body?.data !== 'string';
    const request = plain ? null : decodeRequest(body?.data);
    const json = plain ? (body ?? {}) : request?.json;
    if (!json) return { status: 'error' };
    const reply = (value: object) =>
      request ? { data: encodeResponse(value, request.key) } : value;

    const mac = MacAddress.parse(text(json.mac_address));
    const playlistId = loose(json.id);
    const found = mac.ok && playlistId ? await this.findDevice.execute(mac.value) : null;
    if (!found?.ok) return reply(NO_PERMISSION);
    const removed = await this.remove.execute({
      deviceId: found.value.device.id,
      playlistId,
      by: 'app',
    });
    if (!removed.ok) return reply(NO_PERMISSION);
    return reply({ status: 'success', msg: 'Playlist removed successfully' });
  }

  /** Signed Android apps: add, or update when a playlistId is sent (both routes, as before). */
  @LegacyDevice()
  @Post(['MBBPj5UwlCmTstXGb/manage/add_playlist', 'MBBPj5UwlCmTstXGb/manage/update_playlist'])
  @HttpCode(200)
  async manageSave(@Body() body: JsonBody) {
    const checked = await this.signed(body);
    if (!checked.ok) return checked.refusal;
    const { json, device } = checked;

    const type = text(json.playlist_type).trim();
    const playlistId = loose(json.playlistId);
    const pin = loose(json.pin);
    const isProtected = loose(json.is_protected) === '1';
    const username = text(json.username).trim();
    const password = text(json.password);
    const code = loose(json.playlist_code);
    if (isProtected && !pin && !playlistId) {
      return { status: 'error', msg: 'Sorry, pin is required for protected playlist' };
    }
    if (type === 'xc' && (!username || !password)) {
      return {
        status: 'error',
        msg: 'Sorry, username and password are required for this playlist type',
      };
    }
    if (
      type === 'stalker' &&
      (!text(json.portal_name) || !text(json.portal_address) || !text(json.stalker_mac_address))
    ) {
      return {
        status: 'error',
        msg: 'Sorry, portal_name, portal_address and stalker_mac_address are required for this playlist type',
      };
    }
    if (!MANAGE_TYPES.includes(type))
      return { status: 'error', msg: 'Sorry, Playlist type is not valid' };
    if (code && !/^\d+$/.test(code))
      return { status: 'error', msg: 'Code can only contain digits' };

    const url = text(json.playListURL).trim();
    const name = text(json.playListName).trim() || text(json.portal_name).trim();
    const source =
      type === 'stalker'
        ? {
            kind: 'stalker' as const,
            portalUrl: text(json.portal_address),
            portalName: text(json.portal_name) || null,
            fallbackUrl: text(json.portal_fallback_address) || null,
            mac: text(json.stalker_mac_address) || null,
          }
        : type === 'code'
          ? { kind: 'code' as const, code }
          : type === 'xc' && !/[/]get[.]php/i.test(url)
            ? { kind: 'xtream' as const, server: url, username, password }
            : { kind: 'link' as const, url };
    const saved = playlistId
      ? await this.edit.execute({
          deviceId: device.id,
          by: 'app',
          playlistId,
          ...(name ? { name } : {}),
          source,
          newPin: isProtected ? pin || undefined : null,
        })
      : await this.add.execute({
          deviceId: device.id,
          name,
          source,
          pin: isProtected ? pin : null,
          addedBy: { via: 'app', resellerId: null },
        });
    if (!saved.ok) {
      return saved.error.code === 'playlists.not_found'
        ? PLAYLIST_MISSING
        : { status: 'error', msg: saved.error.message };
    }
    return {
      status: 'success',
      msg: playlistId ? 'Playlist Updated successfully' : 'Playlist added successfully',
    };
  }

  @LegacyDevice()
  @Post('MBBPj5UwlCmTstXGb/manage/delete_playlist')
  @HttpCode(200)
  async manageDelete(@Body() body: JsonBody) {
    const checked = await this.signed(body);
    if (!checked.ok) return checked.refusal;
    const playlistId = loose(checked.json.playlistId);
    if (!playlistId) return PLAYLIST_MISSING;
    const removed = await this.remove.execute({
      deviceId: checked.device.id,
      playlistId,
      by: 'app',
    });
    if (!removed.ok) return PLAYLIST_MISSING;
    return { status: 'success', message: 'Playlist deleted successfully' };
  }

  /** The saved playlist as the TV routes send it. */
  private async savedItem(
    playlistId: string,
    device: { id: string; platform: string; stalkerEnabled: boolean },
  ) {
    const served = await this.reply.execute({
      deviceId: device.id,
      platform: device.platform,
      appVersion: null,
      stalkerEnabled: true,
      includePins: false,
    });
    const entry = served.playlists.find((p) => p.id === playlistId);
    return entry ? legacyPlaylist(entry) : { id: playlistId };
  }

  /** The signed routes' checks (signature, AES, the device of the MAC), with their old answers. */
  private async signed(
    body: JsonBody,
  ): Promise<
    | { ok: true; json: Record<string, unknown>; device: { id: string } }
    | { ok: false; refusal: Record<string, unknown> }
  > {
    const signature = text(body?.signature);
    if (!signature)
      return { ok: false, refusal: { status: 'error', msg: 'Sorry, Request Unauthorized' } };
    const [aes, signing] = await Promise.all([
      this.devices.key(LEGACY_KEYS.androidAesNew),
      this.devices.key(LEGACY_KEYS.androidSigning),
    ]);
    const data = text(body?.data);
    if (!aes || !signing || !data || !sameText(signature, sign(signing, data))) {
      return { ok: false, refusal: { status: 'error', msg: 'Sorry, Request Security Issue' } };
    }
    let json: Record<string, unknown> | null = null;
    try {
      const parsed: unknown = JSON.parse(aesDecrypt(data, aes) ?? '');
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>;
      }
    } catch {
      json = null;
    }
    if (!json)
      return { ok: false, refusal: { status: 'error', msg: 'Sorry, Request Not Processed' } };
    const mac = MacAddress.parse(text(json.mac_address));
    const found = mac.ok ? await this.findDevice.execute(mac.value) : null;
    if (!found?.ok) return { ok: false, refusal: DEVICE_MISSING };
    return { ok: true, json, device: found.value.device };
  }
}
