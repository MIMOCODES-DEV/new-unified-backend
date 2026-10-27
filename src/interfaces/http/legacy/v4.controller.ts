/**
 * Old-app routes: V4, the login of the current IBO, BobPlayer and CRPlayer apps. Same paths and
 * formats as the old backends, one set per app type in the path (/api/lg/v4/..., ...).
 * - POST recaptcha     plain JSON {mac_address, app_type}
 *     a MAC that solved one before → {status: "already_verified"}; else {status, captcha, token}
 * - POST device_login  {data: <envelope>} {mac_address, app_type, u_id, version,
 *                       recaptcha_code?, recaptcha_token?, uid_captcha_code?, uid_captcha_token?}
 *     → {data: <envelope>} {status: "success", token}   (token = the old XOR device token)
 * - POST device_info   Bearer <token>, {data: <envelope>} → {data: <envelope>} device info
 * - POST manage/add_playlist, manage/update_playlist   Bearer, {data: <envelope>}
 *     {mac_address, playlistId?, playListName, playListURL, username, password, is_protected, pin,
 *      playlist_type: general|xc|stalker, portal_name, portal_address, portal_fallback_address,
 *      stalker_mac_address}; with playlistId it updates, without it adds (both routes, as before)
 *     → plain JSON {status, msg, playlist}
 * - POST manage/delete_playlist   Bearer, {data: <envelope>} {mac_address, playlistId} → plain JSON
 * - POST device/add   Bearer, {data: <envelope>} → {data: <envelope>} StarArcs' guest login reply
 * A uid that does not match answers {status: "uid_mismatch_captcha", captcha, captcha_token}
 * on both login routes, with a captcha showing the stored uid (DEV-4).
 * Bearer refusals (401 no token, 403 bad token, other MAC or app type) come back encrypted when
 * the body could be read, as the old verifyAnyDeviceToken did.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Ip,
  Logger,
  NotFoundException,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  FindDeviceByTokenIdUseCase,
  HasSolvedCaptchaUseCase,
  IssueCaptchaUseCase,
  IssueUidRecoveryCaptchaUseCase,
  LoginV4DeviceUseCase,
  type Platform,
} from '../../../modules/devices/index.js';
import { DeviceLicenseUseCase } from '../../../modules/licensing/index.js';
import {
  AddPlaylistUseCase,
  DeletePlaylistUseCase,
  EditPlaylistUseCase,
  PlaylistReplyUseCase,
} from '../../../modules/playlists/index.js';
import { GetTenantConfigUseCase } from '../../../modules/tenants/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { Clock } from '../../../shared/kernel/clock.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { type DecodedRequest, decodeRequest, encodeResponse, randomKey } from './ibo-envelope.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';
import {
  legacyLicense,
  legacyPlaylist,
  legacyUrls,
  notificationFields,
  platformOfPath,
  raspEnforceField,
} from './legacy-reply.js';
import { StarArcsGuests } from './stararcs-guests.js';
import { decodeDeviceToken, encodeDeviceToken } from './xor-device-token.js';

type JsonBody = Record<string, unknown> | undefined;

/** The V4 apps show 4 characters. */
const V4_CAPTCHA_LENGTH = 4;

/** What the old backends answered for each refusal of a V4 login. */
/** The old manage replies: plain JSON, `msg` (a missing playlist answered in `result`). */
const NOT_PROCESSED = { status: 'error', msg: 'Sorry, Request Not Processed' };
const PLAYLIST_NOT_FOUND = { status: 'error', result: 'Sorry, we could not find playlist' };
const MANAGE_TYPES = ['general', 'xc', 'stalker'];
const GET_PHP = /[/]get[.]php/i;

/** A field the apps send as text or as a number (pin, is_protected). */
const loose = (value: unknown): string =>
  typeof value === 'number' ? String(value) : text(value).trim();

const LOGIN_ERRORS: Record<string, { message: string; error_code?: number }> = {
  'devices.invalid_uid': { message: 'Invalid u_id. Must be exactly 6 alphanumeric characters.' },
  'devices.captcha_required': { message: 'Captcha code and token are required' },
  'devices.invalid_captcha': {
    message: 'Invalid or expired captcha. Please request a new captcha and try again.',
    error_code: 401,
  },
};

@UseFilters(LegacyErrorFilter)
@Controller('api/:appType/v4')
export class V4Controller {
  private readonly logger = new Logger(V4Controller.name);

  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly context: TenantContext,
    private readonly hasSolved: HasSolvedCaptchaUseCase,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly issueUidCaptcha: IssueUidRecoveryCaptchaUseCase,
    private readonly login: LoginV4DeviceUseCase,
    private readonly findDevice: FindDeviceByTokenIdUseCase,
    private readonly license: DeviceLicenseUseCase,
    private readonly playlists: PlaylistReplyUseCase,
    private readonly tenantConfig: GetTenantConfigUseCase,
    private readonly addPlaylist: AddPlaylistUseCase,
    private readonly editPlaylist: EditPlaylistUseCase,
    private readonly deletePlaylist: DeletePlaylistUseCase,
    private readonly stararcs: StarArcsGuests,
  ) {}

  @LegacyDevice()
  @Post('recaptcha')
  @HttpCode(200)
  async recaptcha(@Param('appType') pathType: string, @Body() body: JsonBody) {
    const platform = this.platform(pathType);
    const mac = MacAddress.parse(text(body?.mac_address));
    if (!mac.ok) throw new HttpException({ status: 'error', message: 'Invalid Data' }, 400);
    const sent = text(body?.app_type);
    if (sent && platformOfPath(sent) !== platform) {
      throw new HttpException({ status: 'error', message: 'Invalid app_type' }, 400);
    }
    if (await this.hasSolved.execute(mac.value)) return { status: 'already_verified' };

    const { token, svg } = await this.issueCaptcha.execute({
      kind: 'v4',
      mac: mac.value,
      appDeviceId: null,
      platform,
      length: V4_CAPTCHA_LENGTH,
    });
    return { status: 'success', captcha: svg, token };
  }

  @LegacyDevice()
  @Post('device_login')
  @HttpCode(200)
  async deviceLogin(@Param('appType') pathType: string, @Body() body: JsonBody, @Ip() ip: string) {
    const platform = this.platform(pathType);
    const request = decodeRequest(body?.data);
    const reply = (value: unknown) => ({
      data: encodeResponse(value, request?.key || randomKey()),
    });
    if (!request) return reply({ status: 'error' });
    const json = request.json;
    if (platformOfPath(text(json.app_type)) !== platform) {
      return reply({ status: 'error', message: 'Invalid app_type' });
    }

    const loggedIn = await this.loginOrRefusal(json, platform, ip);
    if (!loggedIn.ok) return reply(loggedIn.refusal);
    const { id, macAddress } = loggedIn.device;
    return reply({ status: 'success', token: encodeDeviceToken(this.tokenKey(), id, macAddress) });
  }

  @LegacyDevice()
  @Post('device_info')
  @HttpCode(200)
  async deviceInfo(
    @Param('appType') pathType: string,
    @Body() body: JsonBody,
    @Ip() ip: string,
    @Headers('authorization') authorization?: string,
  ) {
    const platform = this.platform(pathType);
    const request = decodeRequest(body?.data);
    // cr brands send rasp_enforce in every device_info answer, errors included.
    const reply = (value: object) => ({
      data: encodeResponse({ ...this.raspEnforce(), ...value }, request?.key || randomKey()),
    });
    const { device: tokenDevice } = await this.authenticate(
      request,
      authorization,
      this.raspEnforce(),
    );
    if (!request) return reply({ status: 'error' });
    const json = request.json;

    // The same checks as the login (uid, V4 lock), and this visit is recorded.
    const loggedIn = await this.loginOrRefusal(
      { ...json, mac_address: tokenDevice.macAddress },
      platform,
      ip,
    );
    if (!loggedIn.ok) {
      const refusal = loggedIn.refusal as { message?: string };
      if (refusal.message === LOGIN_ERRORS['devices.captcha_required']!.message) {
        return reply({
          status: 'error',
          error_code: 404,
          message: 'Device not registered. Please complete captcha registration first.',
        });
      }
      return reply(loggedIn.refusal);
    }
    const device = loggedIn.device;
    const version = text(json.version) || null;
    return reply(await this.deviceInfoReply(device, platform, version, ip));
  }

  /**
   * Adds a playlist, or updates one when `playlistId` is sent: both manage routes do both, as the
   * old UpdateAddPlayListAnyDevice did. The reply is plain JSON with the saved playlist in the
   * `urls` shape, plus `_id`, which the apps keep as its id.
   */
  @LegacyDevice()
  @Post(['manage/add_playlist', 'manage/update_playlist'])
  @HttpCode(200)
  async savePlaylist(
    @Param('appType') pathType: string,
    @Body() body: JsonBody,
    @Headers('authorization') authorization?: string,
  ) {
    const platform = this.platform(pathType);
    const request = decodeRequest(body?.data);
    const { device } = await this.authenticatedDevice(platform, request, authorization);
    if (!request) return NOT_PROCESSED;
    const json = request.json;

    const type = text(json.playlist_type);
    const playlistId = text(json.playlistId);
    const isProtected = loose(json.is_protected) === '1';
    const pin = loose(json.pin);
    const username = text(json.username);
    const password = text(json.password);
    // An update may leave out the PIN of a playlist that is already protected: device_info never
    // sends PINs back, so the app does not have it (the old route asked for it every time).
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
    if (!MANAGE_TYPES.includes(type)) {
      return { status: 'error', msg: 'Sorry, Playlist type is not valid' };
    }

    const name = text(json.playListName).trim() || text(json.portal_name).trim();
    const url = text(json.playListURL).trim();
    const source =
      type === 'stalker'
        ? {
            kind: 'stalker' as const,
            portalUrl: text(json.portal_address),
            portalName: text(json.portal_name) || null,
            fallbackUrl: text(json.portal_fallback_address) || null,
            mac: text(json.stalker_mac_address) || null,
          }
        : // An Xtream login sent as a get.php link keeps its link; a bare server takes the fields.
          type === 'xc' && !GET_PHP.test(url)
          ? { kind: 'xtream' as const, server: url, username, password }
          : { kind: 'link' as const, url };

    const saved = playlistId
      ? await this.editPlaylist.execute({
          deviceId: device.id,
          by: 'app',
          playlistId,
          ...(name ? { name } : {}),
          source,
          // Protected without a PIN: keep the stored PIN. Not protected: remove it.
          newPin: isProtected ? pin || undefined : null,
        })
      : await this.addPlaylist.execute({
          deviceId: device.id,
          name,
          source,
          pin: isProtected ? pin : null,
          addedBy: { via: 'app', resellerId: null },
        });
    if (!saved.ok) {
      return saved.error.code === 'playlists.not_found'
        ? PLAYLIST_NOT_FOUND
        : { status: 'error', msg: saved.error.message };
    }
    return {
      status: 'success',
      msg: playlistId ? 'Playlist Updated successfully' : 'Playlist added successfully',
      playlist: await this.savedPlaylistReply(saved.value.id, device, platform, json),
    };
  }

  @LegacyDevice()
  @Post('manage/delete_playlist')
  @HttpCode(200)
  async removePlaylist(
    @Param('appType') pathType: string,
    @Body() body: JsonBody,
    @Headers('authorization') authorization?: string,
  ) {
    const platform = this.platform(pathType);
    const request = decodeRequest(body?.data);
    const { device } = await this.authenticatedDevice(platform, request, authorization);
    if (!request) return NOT_PROCESSED;
    const playlistId = text(request.json.playlistId);
    if (!text(request.json.mac_address) || !playlistId) {
      return { status: 'error', msg: 'Sorry, Request Security Issue' };
    }
    const deleted = await this.deletePlaylist.execute({
      deviceId: device.id,
      playlistId,
      by: 'app',
    });
    if (!deleted.ok) return PLAYLIST_NOT_FOUND;
    return { status: 'success', message: 'Playlist deleted successfully' };
  }

  /**
   * Registers the logged-in device as a StarArcs guest and relays StarArcs' reply (the apps read
   * its token). The MAC is the token's, so a device can only register itself.
   */
  @LegacyDevice()
  @Post('device/add')
  @HttpCode(200)
  async stararcsGuest(
    @Param('appType') pathType: string,
    @Body() body: JsonBody,
    @Headers('authorization') authorization?: string,
  ) {
    const platform = this.platform(pathType);
    const request = decodeRequest(body?.data);
    const { device } = await this.authenticatedDevice(platform, request, authorization);
    const reply = (value: unknown) => ({
      data: encodeResponse(value, request?.key || randomKey()),
    });
    if (!request) return reply({ status: 'error' });
    const refused = { status: 'error', message: 'Sorry, Request Not Processed' };
    const appName = (await this.tenantConfig.execute(this.context.current)).stararcs.appName;
    if (!appName) {
      this.logger.error(
        `${this.context.current.slug}: stararcs.appName is not set, device/add cannot register`,
      );
      return reply(refused);
    }
    return reply((await this.stararcs.register(device.macAddress, appName)) ?? refused);
  }

  /** The saved playlist as device_info would send it, with `_id` and `device_id`. */
  private async savedPlaylistReply(
    playlistId: string,
    device: { id: string; stalkerEnabled: boolean },
    platform: Platform,
    json: Record<string, unknown>,
  ) {
    const served = await this.playlists.execute({
      deviceId: device.id,
      platform,
      appVersion: text(json.version) || null,
      stalkerEnabled: device.stalkerEnabled,
      includePins: false,
    });
    const entry = served.playlists.find((p) => p.id === playlistId);
    const fields = entry ? legacyPlaylist(entry) : { id: playlistId };
    return { _id: playlistId, device_id: device.id, ...fields };
  }

  /**
   * The bearer check of the routes after login, as the old verifyAnyDeviceToken: the token's
   * device must use this route's app type, and an app_type sent in the body must match too.
   */
  private async authenticatedDevice(
    platform: Platform,
    request: DecodedRequest | null,
    authorization: string | undefined,
  ) {
    const found = await this.authenticate(request, authorization, {});
    if (found.device.platform !== platform) {
      this.refuse(request, {}, 403, 'Token does not match route app_type');
    }
    const sentType = text(request?.json.app_type);
    if (sentType && platformOfPath(sentType) !== platform) {
      this.refuse(request, {}, 403, 'Token does not match request app_type');
    }
    return found;
  }

  /**
   * The device of a V4 bearer token. The token is not signed: the device must exist with the same
   * id and MAC (a token from an old backend carries the old _id, found through legacy.id), and a
   * MAC sent in the body must be the token's.
   */
  private async authenticate(
    request: DecodedRequest | null,
    authorization: string | undefined,
    extra: object,
  ) {
    if (!authorization) this.refuse(request, extra, 401, 'Device login token is required');
    const raw = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
    const token = decodeDeviceToken(this.tokenKey(), raw);
    if (!token) return this.refuse(request, extra, 403, 'Invalid device login token');
    const found = await this.findDevice.execute(token.deviceId);
    if (!found.ok || found.value.device.macAddress !== token.mac) {
      return this.refuse(request, extra, 403, 'Invalid device login token');
    }
    const sent = MacAddress.parse(text(request?.json.mac_address));
    if (sent.ok && sent.value.value !== token.mac) {
      return this.refuse(request, extra, 403, 'Token does not match request mac_address');
    }
    return found.value;
  }

  /** A bearer refusal: encrypted when the body could be read, plain otherwise. */
  private refuse(
    request: DecodedRequest | null,
    extra: object,
    status: number,
    message: string,
  ): never {
    const payload = { ...extra, status: 'error', message };
    throw new HttpException(
      request ? { data: encodeResponse(payload, request.key) } : payload,
      status,
    );
  }

  /** Runs the V4 login rules; a refusal comes back in the old reply shape. */
  private async loginOrRefusal(
    json: Record<string, unknown>,
    platform: Platform,
    ip: string,
  ): Promise<
    | {
        ok: true;
        device: {
          id: string;
          macAddress: string;
          deviceKey: string;
          parentPin: string | null;
          stalkerEnabled: boolean;
        };
      }
    | { ok: false; refusal: Record<string, unknown> }
  > {
    const mac = MacAddress.parse(text(json.mac_address));
    if (!mac.ok) return { ok: false, refusal: { status: 'error', message: 'Invalid Data' } };
    const answered = (code: string, token: string) =>
      code && token ? { token, answer: code } : null;
    const uidCaptcha = answered(text(json.uid_captcha_code), text(json.uid_captcha_token));

    const result = await this.login.execute({
      mac: mac.value,
      platform,
      uid: text(json.u_id),
      ip,
      appVersion: text(json.version) || null,
      captcha: answered(text(json.recaptcha_code), text(json.recaptcha_token)),
      uidCaptcha,
    });
    if (result.ok) return { ok: true, device: result.value.device };

    const code = result.error.code;
    const uidRefused =
      code === 'devices.uid_mismatch' || (uidCaptcha && code === 'devices.invalid_captcha');
    if (uidRefused) {
      const fresh = await this.issueUidCaptcha.execute({ mac: mac.value, platform });
      if (fresh.ok) {
        return {
          ok: false,
          refusal: {
            status: 'uid_mismatch_captcha',
            error_code: 401,
            message: uidCaptcha
              ? 'Incorrect code. Please read the image carefully and try again.'
              : 'Device ID mismatch. Enter the code shown in the image to verify ownership.',
            captcha: fresh.value.svg,
            captcha_token: fresh.value.token,
          },
        };
      }
    }
    return {
      ok: false,
      refusal: { status: 'error', ...(LOGIN_ERRORS[code] ?? { message: 'Invalid Data' }) },
    };
  }

  /**
   * The device-info fields the old backends sent (getDeviceInfoAnyDevice). What differs per brand
   * comes from the brand's `legacy` settings, never from its slug.
   */
  private async deviceInfoReply(
    device: { id: string; deviceKey: string; parentPin: string | null; stalkerEnabled: boolean },
    platform: Platform,
    appVersion: string | null,
    ip: string,
  ) {
    const [license, playlists, config] = await Promise.all([
      this.license.execute(device.id),
      this.playlists.execute({
        deviceId: device.id,
        platform,
        appVersion,
        stalkerEnabled: device.stalkerEnabled,
        includePins: false,
      }),
      this.tenantConfig.execute(this.context.current),
    ]);
    if (!license.ok) throw new HttpException({ status: 'error', message: 'Invalid Data' }, 404);
    return {
      status: 'success',
      mac_registered: true,
      is_expired: false,
      ...legacyLicense(license.value, false, this.clock.now()),
      device_key: device.deviceKey,
      // Old ibo and cr did not send it, but the apps read it (the IBO app warns when it is
      // missing). "off" = parental control off; null would leave the app's old setting.
      parent_pin: device.parentPin ?? 'off',
      trial_days: config.trial.days,
      has_own_playlist: playlists.hasOwnPlaylist,
      urls: legacyUrls(playlists),
      ip_address: ip,
      // Content (themes, notifications, languages) comes in a later phase.
      themes: [],
      languages: [],
      ...this.notificationFields(),
    };
  }

  private raspEnforce() {
    return raspEnforceField(this.context.current.settings.legacy);
  }

  private notificationFields() {
    return notificationFields(this.context.current.settings.legacy);
  }

  private platform(pathType: string): Platform {
    const platform = platformOfPath(pathType);
    if (!platform) throw new NotFoundException();
    return platform;
  }

  private tokenKey(): string {
    const key = this.config.env.LEGACY_DEVICE_TOKEN_KEY;
    if (!key) {
      throw new HttpException({ status: 'error', message: 'V4 login is not configured' }, 503);
    }
    return key;
  }
}
