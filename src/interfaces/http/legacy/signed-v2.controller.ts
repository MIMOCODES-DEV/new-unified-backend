/**
 * Old-app door: signed v2 (same paths and formats as the old backends).
 * - POST /api/MBBPj5UwlCmTstXGb/android/playlist_information   (Android apps)
 * - POST /api/Mxcvfghytrhjsjj/tv/playlist_information           (TV alias, bob)
 *   form data=<CryptoJS AES, V2 key>, signature=<base64 HMAC-SHA256 of data>
 *   → {data: <AES, V2 key>} device info
 * Rules (failures answer like the old backends: HTTP 200, plain {status: "error", msg}):
 * - signature missing → "Request Unauthorized"; wrong → "Request Security Issue"
 * - data does not decrypt to JSON → "Request Not Processed"
 * - no MAC, or a device already on V4 → "Request Parameters are incomplete"
 * - Otherwise register-or-get (no captcha; a new MAC gets a trial) and reply. Android app types
 *   also get the app-update fields and their u_id echoed back, like ibo's Android reply.
 */
import { Body, Controller, HttpCode, Ip, Post, UseFilters } from '@nestjs/common';
import {
  GetDeviceUseCase,
  parseAppType,
  RegisterDeviceUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { aesDecrypt, aesEncrypt } from './cryptojs-aes.js';
import { isV4Locked, legacyDeviceInfo } from './legacy-device.mapper.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { sameText, sign } from './legacy-signature.js';
import { parseObject, text } from './legacy-fields.js';

type FormBody = Record<string, string | undefined> | undefined;

const fail = (msg: string) => ({ status: 'error', msg });

const ANDROID_TYPES = new Set(['android', 'android_tv', 'fire_tv']);

@UseFilters(LegacyErrorFilter)
@Controller('api')
export class SignedV2Controller {
  constructor(
    private readonly config: AppConfig,
    private readonly getDevice: GetDeviceUseCase,
    private readonly registerDevice: RegisterDeviceUseCase,
  ) {}

  @LegacyDevice()
  @Post('MBBPj5UwlCmTstXGb/android/playlist_information')
  @HttpCode(200)
  android(@Body() body: FormBody, @Ip() ip: string) {
    return this.playlistInformation(body, ip);
  }

  @LegacyDevice()
  @Post('Mxcvfghytrhjsjj/tv/playlist_information')
  @HttpCode(200)
  tvAlias(@Body() body: FormBody, @Ip() ip: string) {
    return this.playlistInformation(body, ip);
  }

  private async playlistInformation(body: FormBody, ip: string) {
    const aesKey = this.config.env.LEGACY_V2_AES_KEY;
    const signingKey = this.config.env.LEGACY_V2_SIGNING_KEY;
    if (!aesKey || !signingKey) return fail('Sorry, Request Not Processed');

    const data = body?.data ?? '';
    if (!body?.signature) return fail('Sorry, Request Unauthorized');
    if (!sameText(body.signature, sign(signingKey, data))) {
      return fail('Sorry, Request Security Issue');
    }
    const json = parseObject(aesDecrypt(data, aesKey));
    if (!json) return fail('Sorry, Request Not Processed');

    const mac = text(json.mac_address);
    if (!mac) return fail('Sorry, Request Parameters are incomplete');
    const known = await this.getDevice.execute(mac);
    if (known && isV4Locked(known.device)) return fail('Sorry, Request Parameters are incomplete');

    const rawType = text(json.app_type).toLowerCase();
    const appType = parseAppType(rawType).ok ? rawType : 'unknown';
    const result = await this.registerDevice.execute({ mac, appType });
    if (!result.ok) return fail('Sorry, Request Parameters are incomplete');

    const { device, created, trialDays } = result.value;
    const reply = {
      ...legacyDeviceInfo(device, { created, trialDays, ip }),
      ...(ANDROID_TYPES.has(appType)
        ? { android_version_code: '1', apk_url: '', u_id: text(json.u_id) }
        : {}),
    };
    return { data: aesEncrypt(JSON.stringify(reply), aesKey) };
  }
}
