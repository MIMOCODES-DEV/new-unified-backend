/**
 * The store's routes (the IBO Dev store panel, where resellers sell): same paths, fields and
 * replies as the old backends (docs/inventory/store-contract.md). The store picks the brand by the
 * host it calls and sends the brand's store key in a `token` header.
 *
 * - POST /api/validate-mac-address    {macAddress}: the device and its playlists, before a sale
 * - POST /api/save-device-activation  {mac_address, expire_date, is_trial, …}: a sale or a cancel
 * - POST /api/save-play-list          add (current_playlist_url_id -1) or edit a playlist
 * - POST /api/delete-playlist         one playlist by type (ibo, bob) or by type and code (cr)
 * - POST /api/delete-playlist-by-id   one playlist by id (cr)
 * - POST /api/reset-playlist          every playlist of a device
 * - POST /api/update-domain           a provider moved host: rewrite the playlists (PL-8)
 * - POST /api/count-domain-updates    how many playlists such a move would touch
 * - POST /api/switch-mac-address      move a license to another MAC (DEV-7)
 *
 * What differs per old backend follows the brand's `legacy.dialect`, never its slug.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  FindDeviceUseCase,
  type FoundDevice,
  RegisterDeviceUseCase,
} from '../../../modules/devices/index.js';
import {
  ActivateLicenseUseCase,
  DeviceLicenseUseCase,
  RevokeLicenseUseCase,
  SwitchMacUseCase,
} from '../../../modules/licensing/index.js';
import {
  AddPlaylistUseCase,
  DeletePlaylistUseCase,
  EditPlaylistUseCase,
  ListPlaylistsUseCase,
  MoveProviderHostUseCase,
  type Playlist,
  type PlaylistProvider,
} from '../../../modules/playlists/index.js';
import { GetTenantConfigUseCase } from '../../../modules/tenants/index.js';
import { Store } from '../../../shared/auth/access.decorators.js';
import { Clock } from '../../../shared/kernel/clock.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { LegacyErrorFilter } from '../legacy/legacy-error.filter.js';
import { platformOfAppType } from '../legacy/legacy-reply.js';
import { StoreKey } from './store-key.js';
import { KIND_OF_OLD_TYPE, storeDevice, storePlaylist } from './store-replies.js';

type Body = Record<string, unknown> | undefined;

/** A field as text: the store sends JSON or a form, so numbers come as either. */
const str = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : '';
/** `true`, `1`, `"1"` or `"true"`. */
const flag = (value: unknown): boolean =>
  value === true || value === 1 || value === '1' || value === 'true';
const day = (date: Date) => date.toISOString().slice(0, 10);

const BAD_TOKEN = { status: 'error', msgStatus: 'TOKEN_NOT_VALID', msg: 'Token is not correct' };
const SWITCH_NOTE =
  'Note: Please be informed that MAC switching is disabled for 1-Year App Activation due to repeated misuse. Only Lifetime App Activation can be switched.';
/** The old switch-mac-address refusals (HTTP 302 with `message`), by the reason. */
const SWITCH_REFUSALS: Record<string, string> = {
  'licensing.multi_activate_switch': `Your device is activated with multiple devices activation. You cannot switch Mac Address.  ${SWITCH_NOTE}`,
  'licensing.yearly_switch_not_allowed': `Your device is activated for One Year. Switch Option is available for lifetime subscriptions only.  ${SWITCH_NOTE}`,
  'licensing.new_mac_not_registered':
    'The requested device is not registered on our System. Please Install the application first on the new device.',
  'licensing.license_not_running': `Your device is expired. Only active devices can be switched.  ${SWITCH_NOTE}`,
  'licensing.switch_needs_paid_device': `Your device is not currently active. Only active devices can be switched.  ${SWITCH_NOTE}`,
  'licensing.mac_switch_limit': `One of Your device has been Switched Before. You Can Only Switch Once.  ${SWITCH_NOTE}`,
  'licensing.mac_taken': 'The requested device is already activated.',
  'licensing.same_mac': 'Sorry, both current and new device Mac Addresses are required',
  'licensing.invalid_mac': 'Sorry, both current and new device Mac Addresses are required',
};

const refuse = (status: number, body: object) => new HttpException(body, status);

// Refusals go out in the old bodies, not the new API's {error: {code, message}}.
@UseFilters(LegacyErrorFilter)
@Controller('api')
export class StoreController {
  constructor(
    private readonly key: StoreKey,
    private readonly context: TenantContext,
    private readonly clock: Clock,
    private readonly findDevice: FindDeviceUseCase,
    private readonly register: RegisterDeviceUseCase,
    private readonly licenseOf: DeviceLicenseUseCase,
    private readonly activate: ActivateLicenseUseCase,
    private readonly revoke: RevokeLicenseUseCase,
    private readonly switchMac: SwitchMacUseCase,
    private readonly listPlaylists: ListPlaylistsUseCase,
    private readonly addPlaylist: AddPlaylistUseCase,
    private readonly editPlaylist: EditPlaylistUseCase,
    private readonly deletePlaylist: DeletePlaylistUseCase,
    private readonly moveHost: MoveProviderHostUseCase,
    private readonly config: GetTenantConfigUseCase,
  ) {}

  @Store()
  @Post('validate-mac-address')
  @HttpCode(200)
  async validateMac(@Headers('token') token: unknown, @Body() body: Body) {
    const euro = await this.euroToEgp();
    if (!(await this.key.accepts(token))) {
      throw refuse(401, { ...BAD_TOKEN, mac_valid: 0, ...euro });
    }
    const found = await this.device(str(body?.macAddress));
    if (!found) {
      return {
        status: 'error',
        msgStatus: 'NOT_FOUND',
        mac_valid: 0,
        msg: 'Sorry, device does not exist',
        ...(this.isCr() ? {} : euro),
      };
    }
    const license = await this.license(found);
    const device = storeDevice(found, license, this.clock.now());
    const playlists = (await this.listPlaylists.execute(found.device.id)).map((p) =>
      storePlaylist(p, found.device),
    );
    // A paid license still running: the store asks before adding credit on top.
    if (license.license && license.active) {
      return {
        status: 'warning',
        mac_valid: 1,
        msgStatus: 'WARNING',
        msg: `This device is activated and will expire on ${device.expire_date}. Are you sure you want to add credit?`,
        ...euro,
        device,
        playlists,
        already_activated: true,
      };
    }
    return { status: 'success', msgStatus: 'SUCCESS', mac_valid: 1, ...euro, device, playlists };
  }

  /**
   * A sale or a cancel: the store sets the end itself. `is_trial` 2 is lifetime; a future date is a
   * license until that day; `is_trial` 0 or 1, or a past date, ends the current license (LIC-3).
   */
  @Store()
  @Post('save-device-activation')
  @HttpCode(200)
  async saveActivation(@Headers('token') token: unknown, @Body() body: Body) {
    const failed = { status: 'error', mac_activated: 0 };
    if (!(await this.key.accepts(token))) throw refuse(401, { ...BAD_TOKEN, mac_activated: 0 });
    const macText = str(body?.mac_address);
    const dateText = str(body?.expire_date);
    if (!macText || !dateText) {
      throw refuse(422, {
        ...failed,
        msgStatus: 'REQUIRED_DATA',
        msg: 'MAC address - Expire Date - Trial Status  are required',
      });
    }
    const endsOn = new Date(dateText);
    if (Number.isNaN(endsOn.getTime())) {
      throw refuse(422, {
        ...failed,
        msgStatus: 'INVALID_DATE',
        msg: 'Invalid expiration date format',
      });
    }

    let found = await this.device(macText);
    let created = false;
    if (!found && this.isCr() && flag(body?.create_if_missing)) {
      const mac = MacAddress.parse(macText);
      if (mac.ok) {
        const made = await this.register.execute({
          mac: mac.value,
          platform: platformOfAppType(str(body?.appType)),
          appDeviceId: null,
          uid: null,
          ip: '0.0.0.0',
          appVersion: null,
          apiVersion: 'legacy',
        });
        if (made.ok) {
          found = made.value.found;
          created = made.value.created;
        }
      }
    }
    if (!found) {
      return { ...failed, msgStatus: 'NOT_FOUND', msg: 'Sorry, device does not exist' };
    }

    const isTrial = Number(str(body?.is_trial));
    const today = day(this.clock.now());
    const cancel = isTrial === 0 || isTrial === 1 || day(endsOn) < today;
    if (cancel) {
      // Nothing to end on a device that never paid, or whose license already ended.
      if (found.paid) await this.revoke.execute({ deviceId: found.device.id });
    } else {
      const resellerId = str(body?.reseller_id) || null;
      const done = await this.activate.execute({
        deviceId: found.device.id,
        type: isTrial === 2 ? 'lifetime' : 'yearly',
        ...(isTrial === 2 ? {} : { endsOn }),
        activatedBy: { source: 'store', actorId: resellerId },
        sourceId: null,
        multiActivate: Number(str(body?.multi_activate)) === 1,
        resellerId,
      });
      // A lifetime sold again on a running lifetime: nothing to change.
      if (!done.ok && done.error.code !== 'licensing.already_lifetime') {
        throw refuse(500, {
          ...failed,
          msgStatus: 'SERVER_ERROR',
          msg: 'An error occurred while processing your request',
        });
      }
    }

    const after = (await this.device(macText)) ?? found;
    const device = storeDevice(after, await this.license(after), this.clock.now());
    const until = day(endsOn);
    return {
      status: 'success',
      msgStatus: 'SUCCESS',
      mac_activated: 1,
      ...(this.isCr() ? { device_created: created } : {}),
      device,
      msg: `Device ${created ? 'created and ' : ''}activated successfully for MAC Address: ${after.device.macAddress} until ${until}`,
    };
  }

  /** Adds a playlist (`current_playlist_url_id` -1) or edits the device's playlist with that id. */
  @Store()
  @Post('save-play-list')
  @HttpCode(200)
  async savePlaylist(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, { ...BAD_TOKEN, mac_valid: 0 });
    const macText = str(body?.mac_address);
    if (!macText) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        mac_valid: 0,
        msg: 'Missing required fields',
      });
    }
    const code = str(body?.code) || str(body?.playlist_code);
    if (this.isCr() && code && !/^\d+$/.test(code)) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        mac_valid: 0,
        msg: 'Code can only contain digits',
      });
    }
    const found = await this.device(macText, str(body?.device_key));
    if (!found) {
      return {
        status: 'error',
        msgStatus: 'NOT_FOUND',
        mac_valid: 0,
        msg: 'Sorry, device information is not correct',
      };
    }

    const type = str(body?.playlist_type) || 'general';
    const url = str(body?.url) || str(body?.playlist_url);
    const username = str(body?.username);
    const password = str(body?.password);
    const source =
      type === 'stalker'
        ? {
            kind: 'stalker' as const,
            portalUrl: str(body?.portal_address),
            portalName: str(body?.portal_name) || null,
            fallbackUrl: str(body?.fallback_portal_address) || null,
            mac: str(body?.stalker_mac_address) || null,
          }
        : code
          ? { kind: 'code' as const, code }
          : type === 'xc' && username && password
            ? { kind: 'xtream' as const, server: url, username, password }
            : { kind: 'link' as const, url };
    const name = str(body?.playlist_name) || str(body?.portal_name);
    const pin = flag(body?.protect) && /^\d{4}$/.test(str(body?.pin)) ? str(body?.pin) : null;
    const provider = this.provider(body);
    const epgUrl = str(body?.epg_url) || null;

    const target = str(body?.current_playlist_url_id);
    let saved: Playlist;
    if (!target || target === '-1') {
      const added = await this.addPlaylist.execute({
        deviceId: found.device.id,
        name,
        source,
        epgUrl,
        pin,
        addedBy: { via: 'store', resellerId: str(body?.reseller_id) || null },
        ...(provider !== undefined ? { provider } : {}),
      });
      if (!added.ok) throw this.playlistRefused(added.error.code, added.error.message);
      saved = added.value;
    } else {
      const current = await this.ownPlaylist(found, target);
      if (!current) {
        throw refuse(404, { status: 'error', msgStatus: 'NOT_FOUND', msg: 'Playlist not found' });
      }
      const edited = await this.editPlaylist.execute({
        deviceId: found.device.id,
        by: 'app',
        playlistId: current.id,
        ...(name ? { name } : {}),
        source,
        epgUrl,
        ...(body?.protect !== undefined ? { newPin: pin } : {}),
        ...(provider !== undefined ? { provider } : {}),
      });
      if (!edited.ok) throw this.playlistRefused(edited.error.code, edited.error.message);
      saved = edited.value;
    }
    return {
      status: 'success',
      msgStatus: 'SUCCESS',
      msg: 'Playlist saved successfully',
      data: storePlaylist(saved, found.device),
    };
  }

  /** The first playlist of a type (ibo, bob: the device key proves the device), or type and code (cr). */
  @Store()
  @Post('delete-playlist')
  @HttpCode(200)
  async deleteByType(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, { ...BAD_TOKEN, mac_valid: 0 });
    const cr = this.isCr();
    const macText = str(body?.mac_address);
    const kind = KIND_OF_OLD_TYPE[str(body?.playlist_type)];
    const code = str(body?.playlist_code);
    const deviceKey = str(body?.device_key);
    if (!macText || !str(body?.playlist_type) || (cr ? !code : !deviceKey)) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        mac_valid: 0,
        msg: 'Missing required fields',
      });
    }
    const found = await this.device(macText, cr ? '' : deviceKey);
    if (!found) {
      throw refuse(404, {
        status: 'error',
        msgStatus: 'NOT_FOUND',
        mac_valid: 0,
        msg: 'Device not found.',
      });
    }
    const target = (await this.listPlaylists.execute(found.device.id)).find(
      (p) => p.type === kind && (!cr || p.code?.code === code),
    );
    if (!target || !(await this.remove(found, target))) {
      throw refuse(404, { status: 'error', msgStatus: 'NOT_FOUND', msg: 'Playlist not found.' });
    }
    return { status: 'success', msgStatus: 'SUCCESS', msg: 'Playlist deleted successfully.' };
  }

  @Store()
  @Post('delete-playlist-by-id')
  @HttpCode(200)
  async deleteById(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, { ...BAD_TOKEN, mac_valid: 0 });
    const macText = str(body?.mac_address);
    const id = str(body?.id);
    if (!macText || !id) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        msg: 'Missing required fields: mac_address and id are required',
      });
    }
    const found = await this.device(macText);
    if (!found) {
      throw refuse(404, { status: 'error', msgStatus: 'NOT_FOUND', msg: 'Device not found' });
    }
    const target = await this.ownPlaylist(found, id);
    if (!target || !(await this.remove(found, target))) {
      throw refuse(404, { status: 'error', msgStatus: 'NOT_FOUND', msg: 'Playlist not found' });
    }
    return { status: 'success', msgStatus: 'SUCCESS', msg: 'Playlist deleted successfully' };
  }

  @Store()
  @Post('reset-playlist')
  @HttpCode(200)
  async reset(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, { ...BAD_TOKEN, mac_valid: 0 });
    const macText = str(body?.mac_address);
    const deviceKey = str(body?.device_key);
    if (!macText || !deviceKey) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        mac_valid: 0,
        msg: 'Missing required fields',
      });
    }
    const found = await this.device(macText, deviceKey);
    if (!found) {
      throw refuse(404, {
        status: 'error',
        msgStatus: 'NOT_FOUND',
        mac_valid: 0,
        msg: 'Device not found.',
      });
    }
    const all = await this.listPlaylists.execute(found.device.id);
    if (all.length === 0) {
      throw refuse(404, { status: 'error', msgStatus: 'NOT_FOUND', msg: 'Playlist not found.' });
    }
    for (const playlist of all) await this.remove(found, playlist);
    return { status: 'success', msgStatus: 'SUCCESS', msg: 'Playlist deleted successfully.' };
  }

  /** PL-8: every playlist of the brand on `current_domain` (`is_admin`), or only these devices'. */
  @Store()
  @Post('update-domain')
  @HttpCode(200)
  async updateDomain(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, BAD_TOKEN);
    const from = hostOf(str(body?.current_domain));
    const to = hostOf(str(body?.new_domain));
    if (!from || !to) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        msg: 'Both current_domain and new_domain are required',
      });
    }
    const scope = this.domainScope(body);
    if (!scope) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        msg: 'Request Can Not Be Processed',
      });
    }
    const limit = Number.parseInt(str(body?.limit) || str(body?.limit_count) || '0', 10) || 0;
    const counted = await this.moveHost.execute({ from, to, scope, countOnly: true });
    if (!counted.ok) throw this.domainRefused(counted.error.message);
    if (counted.value.matched === 0) {
      return {
        status: 'success',
        msgStatus: 'NO_UPDATES',
        msg: 'No URLs found with the specified domain',
        matchedCount: 0,
        modifiedCount: 0,
      };
    }
    const moved = await this.moveHost.execute({
      from,
      to,
      scope,
      countOnly: false,
      ...(limit > 0 ? { limit } : {}),
    });
    if (!moved.ok) throw this.domainRefused(moved.error.message);
    const matched = moved.value.matched;
    return {
      status: 'success',
      msgStatus: 'SUCCESS',
      msg: 'Domain updated successfully',
      selectedCount: limit > 0 ? Math.min(limit, matched) : matched,
      matchedCount: matched,
      modifiedCount: moved.value.changed,
    };
  }

  @Store()
  @Post('count-domain-updates')
  @HttpCode(200)
  async countDomain(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, BAD_TOKEN);
    const from = hostOf(str(body?.current_domain));
    if (!from) {
      throw refuse(400, {
        status: 'error',
        msgStatus: 'INVALID_INPUT',
        msg: 'current_domain is required',
      });
    }
    // Only an explicit `is_admin: false` with MACs narrows the count, as before.
    const scope = this.domainScope(body) ?? { kind: 'brand' as const };
    const counted = await this.moveHost.execute({ from, scope, countOnly: true });
    if (!counted.ok) throw this.domainRefused(counted.error.message);
    return {
      status: 'success',
      msgStatus: 'SUCCESS',
      msg: 'Count retrieved successfully',
      matchedCount: counted.value.matched,
    };
  }

  /** DEV-7. Refusals keep the old HTTP 302 with a `message`. */
  @Store()
  @Post('switch-mac-address')
  @HttpCode(200)
  async switchMacAddress(@Headers('token') token: unknown, @Body() body: Body) {
    if (!(await this.key.accepts(token))) throw refuse(401, BAD_TOKEN);
    const switchRefused = (message: string) => refuse(302, { status: 'error', message });
    const oldMac = str(body?.current_mac_address);
    const newMac = str(body?.mac_address);
    if (!oldMac || !newMac) {
      throw switchRefused('Sorry, both current and new device Mac Addresses are required');
    }
    const found = await this.device(oldMac);
    if (!found) throw switchRefused('Current device not found');
    const playlists = (await this.listPlaylists.execute(found.device.id)).length;
    const switched = await this.switchMac.execute({
      deviceId: found.device.id,
      newMac,
      allowYearly: flag(body?.allow_one_year),
    });
    if (!switched.ok) {
      throw switchRefused(SWITCH_REFUSALS[switched.error.code] ?? switched.error.message);
    }
    return {
      status: 'success',
      message: 'Device Mac Address and Playlists have been Switched Successfully',
      playlists_moved: playlists,
    };
  }

  private isCr(): boolean {
    return this.context.current.settings.legacy.dialect === 'cr';
  }

  private async euroToEgp(): Promise<{ euro_to_egp: number | null }> {
    return { euro_to_egp: (await this.config.execute(this.context.current)).currency.eurToEgp };
  }

  /** The device with this MAC; with a device key, only when it matches. */
  private async device(macText: string, deviceKey = ''): Promise<FoundDevice | null> {
    const mac = MacAddress.parse(macText);
    if (!mac.ok) return null;
    const found = await this.findDevice.execute(mac.value);
    if (!found.ok) return null;
    if (deviceKey && found.value.device.deviceKey !== deviceKey) return null;
    return found.value;
  }

  private async license(found: FoundDevice) {
    const license = await this.licenseOf.execute(found.device.id);
    if (!license.ok) throw refuse(500, { status: 'error', msgStatus: 'SERVER_ERROR' });
    return license.value;
  }

  /** A playlist of this device by its id, or by its old id after the data move. */
  private async ownPlaylist(found: FoundDevice, id: string): Promise<Playlist | null> {
    const all = await this.listPlaylists.execute(found.device.id);
    return all.find((p) => p.id === id || p.legacy?.id === id) ?? null;
  }

  private async remove(found: FoundDevice, playlist: Playlist): Promise<boolean> {
    const done = await this.deletePlaylist.execute({
      deviceId: found.device.id,
      playlistId: playlist.id,
      by: 'app',
    });
    return done.ok;
  }

  /** The provider's contact when the store sent any of it; undefined leaves it as it is. */
  private provider(body: Body): PlaylistProvider | null | undefined {
    const keys = ['contact_name', 'logo', 'whatsapp', 'email'] as const;
    if (!keys.some((key) => body?.[key] !== undefined)) return undefined;
    const provider = {
      name: str(body?.contact_name) || null,
      logo: str(body?.logo) || null,
      whatsapp: str(body?.whatsapp) || null,
      email: str(body?.email) || null,
    };
    return Object.values(provider).some((v) => v !== null) ? provider : null;
  }

  /** `is_admin` true: the whole brand; false with `activated_macs`: those devices; else none. */
  private domainScope(
    body: Body,
  ): { kind: 'brand' } | { kind: 'devices'; macs: MacAddress[] } | null {
    const admin = body?.is_admin;
    if (admin === true || admin === 'true') return { kind: 'brand' };
    const macs = body?.activated_macs;
    if ((admin === false || admin === 'false') && Array.isArray(macs)) {
      const parsed = macs.map((m) => MacAddress.parse(str(m)));
      return { kind: 'devices', macs: parsed.filter((m) => m.ok).map((m) => m.value) };
    }
    return null;
  }

  private playlistRefused(code: string, message: string) {
    const exists = code === 'playlists.exists' || code === 'playlists.name_taken';
    return refuse(exists ? 409 : 400, {
      status: 'error',
      msgStatus: exists ? 'ALREADY_EXISTS' : 'INVALID_INPUT',
      msg: message,
    });
  }

  private domainRefused(message: string) {
    return refuse(400, { status: 'error', msgStatus: 'INVALID_INPUT', msg: message });
  }
}

/** The host (and port) of a domain the store sends, with or without a scheme or path. */
function hostOf(domain: string): string {
  const withoutScheme = domain.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  return withoutScheme.split(/[/?#]/)[0] ?? '';
}
