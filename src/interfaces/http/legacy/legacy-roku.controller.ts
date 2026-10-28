/**
 * Old Roku and mobile (iOS / Android v2-v3) app routes, same paths and plain JSON replies as the
 * old backends: `{error, message, [message2], status}`, HTTP 200 with the error in the body.
 * - POST device_login, register_device   {mac, model?, app_version?} → token + device (+ playlists)
 * - POST validate_status                 Authorization: <token> → device + playlists
 * - GET  playlist                        Authorization → playlists (refused when the trial ended)
 * - POST playlist                        Authorization, {name, url | code, …} → the new playlist
 * - POST activate_free_trial             Authorization → the token again (it never activated anything)
 * - POST {ios,android}/{v2,v3}/device_login   {mac, uid, app_type?, captcha?, captcha_token?}
 *     the device is bound to the app's uid; another uid is refused ("Device UID mismatch!")
 * - POST {ios,android}/{v2,v3}/reset_uid      {mac, uid}: a reinstalled app takes the device over
 * - POST|GET {ios,android}/{v2,v3}/validate_status, playlist   as the Roku routes
 * - POST android/v3/generate_captcha          a captcha for registering a new Android device
 * Tokens are the old XOR device tokens; unlike the old routes, which looked the MAC up alone, the
 * device must exist with the token's id and MAC. cr's Android apps register a new device only
 * with a captcha, as before. Dates are full `YYYY-MM-DD` and "expired" means today, not the time
 * the old server process started.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Ip,
  Post,
  Req,
  UseFilters,
} from '@nestjs/common';
import {
  AnswerAppCaptchaUseCase,
  BindAppUidUseCase,
  FindDeviceUseCase,
  type FoundDevice,
  IssueCaptchaUseCase,
  type Platform,
} from '../../../modules/devices/index.js';
import { AddPlaylistUseCase } from '../../../modules/playlists/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { LegacyDevices } from './legacy-devices.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';
import {
  isRunning,
  type LegacyDeviceInfo,
  mobileItems,
  rokuDevice,
  rokuItems,
  rokuTrialNumber,
} from './legacy-info.js';
import { platformOfAppType } from './legacy-reply.js';

type JsonBody = Record<string, unknown> | undefined;

const BAD_MAC = { error: true, message: 'incorrect mac-address!', status: 404 };
const NOT_AUTHORIZED = { error: true, message: 'Not Authorized!', status: 401 };
const NOT_FOUND = { error: true, message: 'device not found!', status: 404 };
const EXPIRED = { error: true, message: 'your free trial expired!', status: 400 };
const BAD_PLAYLIST = { error: true, message: 'incorrect playlist data!', status: 400 };
const NEWER_APP = { error: true, message: 'This device uses a newer app', status: 403 };

const MOBILE = ['ios/v2', 'android/v2', 'android/v3', 'ios/v3'];
const mobile = (route: string, prefixes = MOBILE) => prefixes.map((p) => `${p}/${route}`);

/** Characters of the Android registration captcha. */
const APP_CAPTCHA_LENGTH = 6;

/** A field the apps send as text or as a number. */
const loose = (value: unknown): string =>
  typeof value === 'number' ? String(value) : text(value).trim();

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class LegacyRokuController {
  constructor(
    private readonly devices: LegacyDevices,
    private readonly findDevice: FindDeviceUseCase,
    private readonly bindUid: BindAppUidUseCase,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly answerCaptcha: AnswerAppCaptchaUseCase,
    private readonly addPlaylist: AddPlaylistUseCase,
  ) {}

  @LegacyDevice()
  @Post('device_login')
  @HttpCode(200)
  async deviceLogin(@Body() body: JsonBody, @Ip() ip: string) {
    const mac = MacAddress.parse(text(body?.mac));
    if (!mac.ok) return BAD_MAC;
    const model = platformOfAppType(text(body?.model));
    const visited = await this.visit(mac.value, model === 'unknown' ? 'roku' : model, body, ip);
    if (!visited.ok) return NEWER_APP;
    const token = this.devices.token(visited.value.device);
    return {
      error: false,
      message: token,
      message2: {
        token,
        device: rokuDevice(visited.value, mac.value.value),
        playlists: rokuItems(visited.value),
      },
      status: 200,
    };
  }

  @LegacyDevice()
  @Post('register_device')
  @HttpCode(200)
  async registerDevice(@Body() body: JsonBody, @Ip() ip: string) {
    const mac = MacAddress.parse(text(body?.mac));
    if (!mac.ok) return BAD_MAC;
    const visited = await this.visit(mac.value, 'roku', body, ip);
    if (!visited.ok) return NEWER_APP;
    return {
      error: false,
      message: {
        token: this.devices.token(visited.value.device),
        device: rokuDevice(visited.value, mac.value.value),
        playlists: rokuItems(visited.value),
      },
      status: 200,
    };
  }

  @LegacyDevice()
  @Post(['validate_status', ...mobile('validate_status')])
  @HttpCode(200)
  async validateStatus(
    @Req() request: { url: string },
    @Ip() ip: string,
    @Headers('authorization') authorization?: string,
  ) {
    const authed = await this.authed(authorization, ip);
    if ('refusal' in authed) return authed.refusal;
    const info = authed.info;
    const device = rokuDevice(info, info.device.macAddress);
    return {
      error: false,
      message: {
        id: device.id,
        mac: device.mac,
        payed: device.payed,
        free_trial: rokuTrialNumber(info),
        free_trial_expired: device.free_trial_expired,
        free_trial_started: device.createdAt,
        key: device.key,
        createdAt: device.createdAt,
        playlists: this.isMobile(request.url) ? mobileItems(info) : rokuItems(info),
        activation_expired: device.free_trial_expired,
        auth_type: 'device_key',
      },
      status: 200,
    };
  }

  @LegacyDevice()
  @Get(['playlist', ...mobile('playlist')])
  async playlists(
    @Req() request: { url: string },
    @Ip() ip: string,
    @Headers('authorization') authorization?: string,
  ) {
    const authed = await this.authed(authorization, ip);
    if ('refusal' in authed) return authed.refusal;
    if (!isRunning(authed.info)) return EXPIRED;
    const items = this.isMobile(request.url) ? mobileItems(authed.info) : rokuItems(authed.info);
    return { error: false, message: items, status: 200 };
  }

  @LegacyDevice()
  @Post(['playlist', ...mobile('playlist')])
  @HttpCode(200)
  async addPlaylistRoute(@Body() body: JsonBody, @Headers('authorization') authorization?: string) {
    if (!authorization) return NOT_AUTHORIZED;
    const name = text(body?.name).trim();
    const url = text(body?.url).trim();
    const code = loose(body?.code);
    const type = text(body?.playlist_type).trim() || (code && !url ? 'code' : 'general');
    if (!name || (type !== 'code' && !url) || (type === 'code' && !code)) return BAD_PLAYLIST;
    if (code && !/^\d+$/.test(code)) {
      return { error: true, message: 'Code can only contain digits!', status: 400 };
    }
    const found = await this.devices.byToken(authorization);
    if (!found) return NOT_FOUND;

    const username = text(body?.username).trim();
    const password = text(body?.password);
    const isProtected = ['1', 'true'].includes(loose(body?.is_protected));
    const pin = isProtected ? loose(body?.pin) : '';
    const source =
      type === 'code'
        ? { kind: 'code' as const, code }
        : type === 'xc' && username && password
          ? { kind: 'xtream' as const, server: url, username, password }
          : { kind: 'link' as const, url };
    const added = await this.addPlaylist.execute({
      deviceId: found.device.id,
      name,
      source,
      epgUrl: text(body?.epg_url).trim() || null,
      pin: pin || null,
      addedBy: { via: 'app', resellerId: null },
    });
    if (!added.ok) {
      return added.error.code === 'playlists.exists'
        ? { error: true, message: 'Playlist already exists', status: 400 }
        : BAD_PLAYLIST;
    }
    return {
      error: false,
      message: {
        is_protected: pin ? 1 : 0,
        pin,
        id: added.value.id,
        deviceId: found.device.id,
        url,
        name,
        username,
        password,
        epg_url: text(body?.epg_url),
        playlist_type: type,
      },
      status: 200,
    };
  }

  @LegacyDevice()
  @Post('activate_free_trial')
  @HttpCode(200)
  async activateFreeTrial(@Ip() ip: string, @Headers('authorization') authorization?: string) {
    const authed = await this.authed(authorization, ip);
    if ('refusal' in authed) return authed.refusal;
    if (!isRunning(authed.info)) return EXPIRED;
    return { error: false, message: this.devices.token(authed.info.device), status: 200 };
  }

  @LegacyDevice()
  @Post(mobile('device_login'))
  @HttpCode(200)
  async mobileLogin(@Req() request: { url: string }, @Body() body: JsonBody, @Ip() ip: string) {
    const android = request.url.includes('/android/');
    const crAndroid = android && this.devices.settings().dialect === 'cr';
    const mac = MacAddress.parse(text(body?.mac));
    const uid = text(body?.uid).trim();
    if (!mac.ok || !uid) {
      return crAndroid
        ? { error: true, message: 'incorrect request parameters!', status: 400 }
        : BAD_MAC;
    }

    const known = await this.findDevice.execute(mac.value);
    if (known.ok && known.value.device.uid !== uid) {
      return { error: true, message: 'Device UID mismatch!', status: 403 };
    }
    if (!known.ok && crAndroid) {
      const answer = text(body?.captcha);
      const token = text(body?.captcha_token);
      if (!answer || !token) {
        return {
          error: true,
          message: 'incorrect request parameters! Cpatcha Needed To Register Device.',
          status: 400,
        };
      }
      if (!(await this.answerCaptcha.execute({ token, answer })).ok) {
        throw new HttpException({ message: 'Captcha is incorrect or expired' }, 400);
      }
    }
    return this.mobileReply(mac.value, this.mobilePlatform(request.url, body), uid, body, ip);
  }

  @LegacyDevice()
  @Post(mobile('reset_uid', ['ios/v2', 'android/v2', 'ios/v3']))
  @HttpCode(200)
  async resetUid(@Req() request: { url: string }, @Body() body: JsonBody, @Ip() ip: string) {
    const mac = MacAddress.parse(text(body?.mac));
    const uid = text(body?.uid).trim();
    if (!mac.ok || !uid) return BAD_MAC;
    const bound = await this.bindUid.execute({ mac: mac.value, uid });
    if (!bound.ok) {
      return bound.error.code === 'devices.not_found'
        ? { error: true, message: 'Device not found!', status: 404 }
        : BAD_MAC;
    }
    if (!bound.value.changed) {
      return { error: true, message: 'Device UID matched! No changes applied', status: 403 };
    }
    return this.mobileReply(mac.value, this.mobilePlatform(request.url, body), uid, body, ip);
  }

  @LegacyDevice()
  @Post('android/v3/generate_captcha')
  @HttpCode(200)
  async appCaptcha() {
    const { svg, token } = await this.issueCaptcha.execute({
      kind: 'web',
      mac: null,
      appDeviceId: null,
      platform: 'android',
      length: APP_CAPTCHA_LENGTH,
    });
    return { svg, token };
  }

  private async mobileReply(
    mac: MacAddress,
    platform: Platform,
    uid: string,
    body: JsonBody,
    ip: string,
  ) {
    const visited = await this.visit(mac, platform, body, ip, uid);
    if (!visited.ok) return NEWER_APP;
    const token = this.devices.token(visited.value.device);
    return {
      error: false,
      message: token,
      message2: { token, device: rokuDevice(visited.value, mac.value) },
      status: 200,
    };
  }

  private visit(mac: MacAddress, platform: Platform, body: JsonBody, ip: string, uid?: string) {
    return this.devices.visit({
      mac,
      appDeviceId: null,
      uid: uid ?? null,
      platform,
      appVersion: text(body?.app_version) || null,
      ip,
      includePins: true,
    });
  }

  /** The device of the request's token with its reply, or the old refusal. */
  private async authed(
    authorization: string | undefined,
    ip: string,
  ): Promise<{ info: LegacyDeviceInfo } | { refusal: object }> {
    if (!authorization) return { refusal: NOT_AUTHORIZED };
    const found: FoundDevice | null = await this.devices.byToken(authorization);
    if (!found) return { refusal: NOT_FOUND };
    const info = await this.devices.info(found, {
      platform: found.device.platform,
      appVersion: found.device.appVersion,
      ip,
      includePins: true,
    });
    return { info };
  }

  private isMobile(url: string): boolean {
    return /\/api\/(ios|android)\/v[23]\//.test(url);
  }

  private mobilePlatform(url: string, body: JsonBody): Platform {
    if (url.includes('/android/')) return 'android';
    const sent = platformOfAppType(text(body?.app_type));
    return sent === 'tvos' || sent === 'macos' ? sent : 'ios';
  }
}
