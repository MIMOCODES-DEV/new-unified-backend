/**
 * Old (pre-V4) TV and Android device-info routes, same paths and formats as the old backends. The
 * fields of each reply follow the brand's old backend (`legacy.dialect`, legacy-info.ts).
 * - GET  status_check                       {status, message}
 * - GET  get_app_setting/:mac_address       {status: "success"} (bob; nothing behind it)
 * - POST playlist_info                      {data: <envelope>} {mac_address, app_type, version,
 *                                           app_device_id} → {data: <envelope>} device info
 * - POST playlist_information               {data: <AES>} → {data: <AES>} (old Android)
 * - GET  playlist_information/:mac/:type?   plain device info (ibo's oldest TV builds)
 * - POST playlist_list                      envelope; the playlists only, never makes a device
 * - POST MBBPj5UwlCmTstXGb/android/playlist_information, Mxcvfghytrhjsjj/tv/playlist_information,
 *        MBBPj5UwlCmTstXGb/tv/v3/playlist_information   {data: <AES>, signature} → {data: <AES>}
 * - POST check_active_status                {data: <AES>} {mac_address} → {data: <AES>} expiry
 * - POST v4/recaptcha                       {mac_address} → a captcha for the TV apps' first start
 * - POST tv/v4/playlist_info                cr's CRPlayer: static app key + typed captcha code
 * - POST device_info                        cr's smart TV builds: by app device id
 * Every call that names a device records the visit; a new device gets a trial (DEV-1). A device
 * that moved to V4 is refused here (DEV-6). Not copied from the old code: its crashes, its device
 * deletions on IP blocks, its random answers for unreadable input.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Ip,
  Logger,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  CheckCaptchaCodeUseCase,
  FindDeviceUseCase,
  HasSolvedCaptchaUseCase,
  IssueCaptchaUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import type { LegacyDialect } from '../../../shared/kernel/tenant-settings.js';
import { aesDecrypt, aesEncrypt } from './cryptojs-aes.js';
import { decodeRequest, encodeResponse, randomKey } from './ibo-envelope.js';
import { LEGACY_KEYS, type LegacyCall, LegacyDevices } from './legacy-devices.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';
import {
  appFamily,
  crTvV4Info,
  type LegacyDeviceInfo,
  smartTvInfo,
  tvInfo,
} from './legacy-info.js';
import { platformOfAppType } from './legacy-reply.js';
import { sameText, sign, tvV3Uid } from './legacy-signature.js';

type JsonBody = Record<string, unknown> | undefined;

const INCOMPLETE = { status: 'error', msg: 'Sorry, Request Parameters are incomplete' };
const NOT_PROCESSED = { status: 'error', msg: 'Sorry, Request Not Processed' };
const UNAUTHORIZED = { status: 'error', msg: 'Sorry, Request Unauthorized' };

/** Smart TV builds of cr's `device_info`. */
const SMART_TV_TYPES = ['samsung', 'lg', 'zeasn', 'vidaa', 'titanos'];

/** Characters of the TV captcha: ibo's TV apps show 4, CRPlayer 2. */
const captchaLength = (dialect: LegacyDialect) => (dialect === 'cr' ? 2 : 4);

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class LegacyTvController {
  private readonly logger = new Logger(LegacyTvController.name);

  constructor(
    private readonly devices: LegacyDevices,
    private readonly findDevice: FindDeviceUseCase,
    private readonly hasSolved: HasSolvedCaptchaUseCase,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly checkCode: CheckCaptchaCodeUseCase,
  ) {}

  @LegacyDevice()
  @Get('status_check')
  statusCheck() {
    return { status: 'success', message: 'API is running' };
  }

  @LegacyDevice()
  @Get('get_app_setting/:mac')
  appSetting() {
    return { status: 'success' };
  }

  @LegacyDevice()
  @Post('playlist_info')
  @HttpCode(200)
  async playlistInfo(@Body() body: JsonBody, @Ip() ip: string) {
    const request = decodeRequest(body?.data);
    if (!request) return { status: 'error' };
    const dialect = this.dialect();
    const reply = (value: unknown) =>
      dialect === 'bob'
        ? { data: encodeResponse(value, request.key), languages: [] }
        : { data: encodeResponse(value, request.key) };

    const json = request.json;
    const mac = MacAddress.parse(text(json.mac_address));
    const appDeviceId = text(json.app_device_id).trim() || null;
    if (!mac.ok && !appDeviceId) {
      return dialect === 'cr'
        ? { status: 'error', message: 'mac_address is required' }
        : INCOMPLETE;
    }
    // ibo's activation-code devices (`device_type`) never got an answer: there is nothing to serve.
    if (json.device_type) return INCOMPLETE;

    const visited = await this.visitTv(json, mac.ok ? mac.value : null, appDeviceId, ip);
    if (!visited.ok) {
      if (visited.error === 'v4_device' && dialect === 'cr') {
        return reply({ status: 'error', message: 'error version' });
      }
      return dialect === 'bob' && visited.error === 'v4_device' ? NOT_PROCESSED : INCOMPLETE;
    }
    return reply(this.tvReply(visited.value, text(json.app_type)));
  }

  /** The oldest Android builds: AES with the brand's old Android key, both ways. */
  @LegacyDevice()
  @Post('playlist_information')
  @HttpCode(200)
  async playlistInformation(@Body() body: JsonBody, @Ip() ip: string) {
    const key = await this.devices.key(LEGACY_KEYS.androidAes);
    const json = key ? this.readAes(body?.data, key) : null;
    if (!key || !json) return this.dialect() === 'ibo' ? UNAUTHORIZED : NOT_PROCESSED;
    const visited = await this.visitTv(json, this.mac(json), null, ip);
    if (!visited.ok) return visited.error === 'v4_device' ? this.v4Refused() : INCOMPLETE;
    return {
      data: aesEncrypt(JSON.stringify(this.tvReply(visited.value, text(json.app_type))), key),
    };
  }

  @LegacyDevice()
  @Get(['playlist_information/:mac', 'playlist_information/:mac/:appType'])
  async playlistInformationByPath(
    @Param('mac') rawMac: string,
    @Param('appType') appType: string | undefined,
    @Ip() ip: string,
  ) {
    const mac = MacAddress.parse(rawMac);
    if (!mac.ok) return INCOMPLETE;
    const json = { mac_address: rawMac, app_type: appType ?? '' };
    const visited = await this.visitTv(json, mac.value, null, ip);
    if (!visited.ok) return INCOMPLETE;
    return this.tvReply(visited.value, appType ?? '');
  }

  /** ibo: a device's playlists only. Read-only: an unknown MAC gets the demo and an error flag. */
  @LegacyDevice()
  @Post('playlist_list')
  @HttpCode(200)
  async playlistList(@Body() body: JsonBody, @Ip() ip: string) {
    const request = decodeRequest(body?.data);
    if (!request) return { status: 'error', msg: 'Sorry, Request unauthorized' };
    const reply = (value: unknown) => ({ data: encodeResponse(value, request.key) });
    const mac = MacAddress.parse(text(request.json.mac_address));
    const found = mac.ok ? await this.findDevice.execute(mac.value) : null;
    if (!found?.ok) {
      return reply({
        mac_registered: true,
        urls: [],
        has_own_playlist: false,
        error: true,
        message: 'device id not found.',
      });
    }
    const info = await this.devices.info(found.value, {
      platform: found.value.device.platform,
      appVersion: null,
      ip,
      includePins: false,
    });
    const tv = this.tvReply(info, text(request.json.app_type));
    return reply({
      mac_registered: true,
      urls: tv.urls,
      has_own_playlist: info.playlists.hasOwnPlaylist,
      mac_address: info.device.macAddress,
    });
  }

  /** The signed Android route (ibo, bob, cr) and bob's signed TV route: AES v2 key, HMAC. */
  @LegacyDevice()
  @Post([
    'MBBPj5UwlCmTstXGb/android/playlist_information',
    'Mxcvfghytrhjsjj/tv/playlist_information',
  ])
  @HttpCode(200)
  async signedPlaylistInformation(@Body() body: JsonBody, @Ip() ip: string) {
    const keys = await this.signedKeys('android');
    const checked = this.checkSigned(body, keys, '');
    if (!checked.ok) return checked.refusal;
    const json = checked.json;
    const dialect = this.dialect();
    const family = appFamily(text(json.app_type));
    // ibo's v2 route answered only its Android and iOS apps.
    if (dialect === 'ibo' && family === 'tv') return { message: 'ok', status: 'failed' };

    const visited = await this.visitTv(
      json,
      this.mac(json),
      text(json.app_device_id).trim() || null,
      ip,
    );
    if (!visited.ok) return visited.error === 'v4_device' ? this.v4Refused() : INCOMPLETE;
    const reply = JSON.stringify(this.tvReply(visited.value, text(json.app_type)));
    // ibo's iOS branch answered with the old Android key.
    const outKey =
      dialect === 'ibo' && family === 'ios'
        ? await this.devices.key(LEGACY_KEYS.androidAes)
        : keys.aes;
    return { data: aesEncrypt(reply, outKey ?? keys.aes) };
  }

  /**
   * The signed TV v3 route. ibo: its own TV keys, and a `u_id` made from the MAC with them (Code 1/2/3
   * errors); bob signed it with the Android keys and checked no u_id.
   */
  @LegacyDevice()
  @Post('MBBPj5UwlCmTstXGb/tv/v3/playlist_information')
  @HttpCode(200)
  async signedTvV3(@Body() body: JsonBody, @Ip() ip: string) {
    const dialect = this.dialect();
    const ibo = dialect === 'ibo';
    const keys = await this.signedKeys(ibo ? 'tv' : 'android');
    const checked = this.checkSigned(body, keys, ibo ? ' Code 1' : '');
    if (!checked.ok) return checked.refusal;
    const json = checked.json;
    const mac = this.mac(json);
    if (ibo) {
      const uid = text(json.u_id);
      if (!mac || !uid) return { status: 'error', msg: 'Sorry, Request Security Issue Code 2' };
      if (!sameText(uid, tvV3Uid(keys.signing, keys.aes, mac.value))) {
        return { status: 'error', msg: 'Sorry, Request Security Issue Code 3' };
      }
    }
    const known = mac ? await this.findDevice.execute(mac) : null;
    // A TV that registered before must send its device key back (ibo V3).
    if (ibo && known?.ok && json.device_key == null) {
      return { status: 'error', msg: 'Sorry, Device is not valid', error_code: '403' };
    }
    const visited = await this.visitTv(json, mac, text(json.app_device_id).trim() || null, ip);
    if (!visited.ok) return visited.error === 'v4_device' ? this.v4Refused() : INCOMPLETE;
    return {
      data: aesEncrypt(JSON.stringify(this.tvReply(visited.value, text(json.app_type))), keys.aes),
    };
  }

  /** ibo's Android v3 route never answered with data (its key handling was broken): kept so. */
  @LegacyDevice()
  @Post('MBBPj5UwlCmTstXGb/android/v3/playlist_information')
  @HttpCode(200)
  signedAndroidV3(@Body() body: JsonBody) {
    return body?.signature ? NOT_PROCESSED : UNAUTHORIZED;
  }

  @LegacyDevice()
  @Post('check_active_status')
  @HttpCode(200)
  async checkActiveStatus(@Body() body: JsonBody, @Ip() ip: string) {
    const key = await this.devices.key(LEGACY_KEYS.androidAes);
    const json = key ? this.readAes(body?.data, key) : null;
    const mac = json ? this.mac(json) : null;
    if (!key || !mac) throw new HttpException(NOT_PROCESSED, 400);
    const reply = (value: object) => ({ data: aesEncrypt(JSON.stringify(value), key) });
    const found = await this.findDevice.execute(mac);
    if (!found.ok) return reply({ status: 'error', msg: 'Sorry, device is not exist' });
    const info = await this.devices.info(found.value, {
      platform: found.value.device.platform,
      appVersion: null,
      ip,
      includePins: false,
    });
    const { expire_date } = this.tvReply(info, 'android') as { expire_date: string };
    return reply({ status: 'success', expire_date });
  }

  /**
   * The TV apps' captcha for a first start (no app type in the path). ibo answers a MAC that
   * solved one with `already_verified`; CRPlayer always gets a new picture (it sends the typed
   * code to `tv/v4/playlist_info`, no token).
   */
  @LegacyDevice()
  @Post('v4/recaptcha')
  @HttpCode(200)
  async recaptcha(@Body() body: JsonBody) {
    const dialect = this.dialect();
    const mac = MacAddress.parse(text(body?.mac_address));
    if (!mac.ok) {
      throw new HttpException(
        { status: 'error', message: dialect === 'cr' ? 'mac_address is required' : 'Invalid Data' },
        400,
      );
    }
    if (dialect !== 'cr' && (await this.hasSolved.execute(mac.value))) {
      return { status: 'already_verified' };
    }
    const { token, svg } = await this.newCaptcha(mac.value, dialect);
    return dialect === 'cr'
      ? { status: 'success', captcha: svg }
      : { status: 'success', captcha: svg, token };
  }

  /**
   * cr's CRPlayer: one static key for the app (brand secret `legacy.tvKey`), and the code the TV
   * typed once, sent again on every start (DEV-4). Counts as V4: the older TV routes refuse the
   * device after.
   */
  @LegacyDevice()
  @Post('tv/v4/playlist_info')
  @HttpCode(200)
  async crTvV4(
    @Body() body: JsonBody,
    @Ip() ip: string,
    @Headers('authorization') authorization?: string,
  ) {
    const request = decodeRequest(body?.data);
    const key = request?.key ?? randomKey();
    const reply = (value: unknown) => ({ data: encodeResponse(value, key) });
    const sent = (authorization ?? text(body?.token)).replace(/^Bearer /, '');
    if (!sent) {
      throw new HttpException(reply({ status: 'error', message: 'Tv key token is required' }), 401);
    }
    const tvKey = await this.devices.key(LEGACY_KEYS.tvKey);
    if (!tvKey || !sameText(sent, tvKey)) {
      throw new HttpException(reply({ status: 'error', message: 'Invalid TV key token' }), 403);
    }
    if (!request) return reply({ status: 'error' });
    const json = request.json;
    if (text(json.app_type).toLowerCase() === 'android') {
      return reply({ status: 'error', message: 'error' });
    }
    const mac = this.mac(json);
    if (!mac) return reply({ status: 'error', message: 'mac_address is required' });

    const code = text(json.recaptcha_code).trim();
    if (!code) {
      const solved = await this.hasSolved.execute(mac);
      const { svg } = await this.newCaptcha(mac, 'cr');
      return reply(
        solved
          ? { status: 'error', message: 'Captcha code is required', captcha: svg }
          : { status: 'captcha_required', message: 'Captcha required', captcha: svg },
      );
    }
    if (!(await this.checkCode.execute({ mac, code })).ok) {
      const { svg } = await this.newCaptcha(mac, 'cr');
      return reply({ status: 'error', message: 'Invalid captcha code', captcha: svg });
    }

    const visited = await this.devices.visit({
      ...this.tvCall(json, mac, text(json.app_device_id).trim() || null, ip),
      apiVersion: 'v4',
    });
    if (!visited.ok) return reply({ status: 'error' });
    return reply(crTvV4Info(visited.value));
  }

  /** cr's smart TV builds: found by app device id; a made-up MAC when new. */
  @LegacyDevice()
  @Post('device_info')
  @HttpCode(200)
  async smartTv(@Body() body: JsonBody, @Ip() ip: string) {
    const request = decodeRequest(body?.data);
    if (!request) return { status: 'error1' };
    const json = request.json;
    const appType = text(json.app_type).toLowerCase();
    if (!SMART_TV_TYPES.includes(appType)) return { status: 'error2' };
    // The old route served any device to a call without an id: refused here.
    const appDeviceId = text(json.app_device_id).trim();
    if (!appDeviceId) return { status: 'error2' };
    const visited = await this.devices.visit({
      ...this.tvCall(json, null, appDeviceId, ip),
    });
    const reply = (value: unknown) => ({ data: encodeResponse(value, request.key) });
    if (!visited.ok) return reply({ status: 'error' });
    return reply(smartTvInfo(visited.value));
  }

  private dialect(): LegacyDialect {
    return this.devices.settings().dialect;
  }

  private mac(json: Record<string, unknown>) {
    const mac = MacAddress.parse(text(json.mac_address));
    return mac.ok ? mac.value : null;
  }

  private tvCall(
    json: Record<string, unknown>,
    mac: MacAddress | null,
    appDeviceId: string | null,
    ip: string,
  ): LegacyCall {
    return {
      mac,
      appDeviceId,
      uid: text(json.u_id).trim() || null,
      platform: platformOfAppType(text(json.app_type)),
      appVersion: text(json.version) || null,
      ip,
      includePins: false,
    };
  }

  private visitTv(
    json: Record<string, unknown>,
    mac: MacAddress | null,
    appDeviceId: string | null,
    ip: string,
  ) {
    return this.devices.visit(this.tvCall(json, mac, appDeviceId, ip));
  }

  private tvReply(info: LegacyDeviceInfo, appType: string): Record<string, unknown> {
    const legacy = this.devices.settings();
    return tvInfo(legacy.dialect, info, appFamily(appType), legacy);
  }

  private v4Refused() {
    if (this.dialect() === 'bob') throw new HttpException(NOT_PROCESSED, 403);
    return INCOMPLETE;
  }

  private newCaptcha(mac: MacAddress, dialect: LegacyDialect) {
    return this.issueCaptcha.execute({
      kind: 'v4',
      mac,
      appDeviceId: null,
      platform: null,
      length: captchaLength(dialect),
    });
  }

  /** The AES JSON object an app sent, or null. */
  private readAes(data: unknown, key: string): Record<string, unknown> | null {
    const plain = typeof data === 'string' ? aesDecrypt(data, key) : null;
    if (!plain) return null;
    try {
      const json: unknown = JSON.parse(plain);
      return json && typeof json === 'object' && !Array.isArray(json)
        ? (json as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }

  private async signedKeys(kind: 'android' | 'tv') {
    const [aes, signing] = await Promise.all([
      this.devices.key(kind === 'tv' ? LEGACY_KEYS.tvAes : LEGACY_KEYS.androidAesNew),
      this.devices.key(kind === 'tv' ? LEGACY_KEYS.tvSigning : LEGACY_KEYS.androidSigning),
    ]);
    if (!aes || !signing) {
      this.logger.error(
        `${kind} app keys are not set for this brand; signed routes refuse every call`,
      );
    }
    return { aes: aes ?? '', signing: signing ?? '' };
  }

  /** The signed routes' checks, in the old order, with their old answers. */
  private checkSigned(
    body: JsonBody,
    keys: { aes: string; signing: string },
    codeSuffix: string,
  ): { ok: true; json: Record<string, unknown> } | { ok: false; refusal: Record<string, unknown> } {
    const signature = text(body?.signature);
    if (!signature) return { ok: false, refusal: UNAUTHORIZED };
    const data = text(body?.data);
    if (!keys.aes || !keys.signing || !data || !sameText(signature, sign(keys.signing, data))) {
      return {
        ok: false,
        refusal: { status: 'error', msg: `Sorry, Request Security Issue${codeSuffix}` },
      };
    }
    const json = this.readAes(data, keys.aes);
    return json ? { ok: true, json } : { ok: false, refusal: NOT_PROCESSED };
  }
}
