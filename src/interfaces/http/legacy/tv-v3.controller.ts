/**
 * Old-app door: TV v3, the IBO app's login (same path and format as the old ibo backend).
 * - POST /api/MBBPj5UwlCmTstXGb/tv/v3/playlist_information
 *   form data=<CryptoJS AES text>, signature=<base64 HMAC-SHA256 of data>
 *   → {data: <AES text>} device info
 * Rules (each failure answers like the old backend: HTTP 200, {status: "error", msg}):
 * - signature missing → "Request Unauthorized"; wrong → "Security Issue Code 1"
 * - data does not decrypt to JSON → "Request Not Processed"
 * - mac_address or u_id missing → "Code 2"; u_id ≠ HMAC formula of the MAC → "Code 3"
 * - Otherwise register-or-get the device (no captcha in v3: a new MAC gets a trial at once)
 *   and reply with the old device-info fields, AES-encrypted with the same key.
 */
import { Body, Controller, HttpCode, Ip, Post, UseFilters } from '@nestjs/common';
import { type Device, RegisterDeviceUseCase } from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { aesDecrypt, aesEncrypt } from './cryptojs-aes.js';
import { DEMO_PLAYLIST, legacyExpireDate, legacyIsTrial } from './legacy-device.mapper.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { sameText, sign, tvV3Uid } from './legacy-signature.js';
import { parseObject, text } from './legacy-fields.js';

type FormBody = Record<string, string | undefined> | undefined;

const fail = (msg: string) => ({ status: 'error', msg });

@UseFilters(LegacyErrorFilter)
@Controller('api/MBBPj5UwlCmTstXGb/tv/v3')
export class TvV3Controller {
  constructor(
    private readonly config: AppConfig,
    private readonly registerDevice: RegisterDeviceUseCase,
  ) {}

  @LegacyDevice()
  @Post('playlist_information')
  @HttpCode(200)
  async playlistInformation(@Body() body: FormBody, @Ip() ip: string) {
    const aesKey = this.config.env.LEGACY_TV_V3_AES_KEY;
    const signingKey = this.config.env.LEGACY_TV_V3_SIGNING_KEY;
    if (!aesKey || !signingKey) return fail('Sorry, Request Not Processed');

    const data = body?.data ?? '';
    const signature = body?.signature;
    if (!signature) return fail('Sorry, Request Unauthorized');
    if (!sameText(signature, sign(signingKey, data))) {
      return fail('Sorry, Request Security Issue Code 1');
    }

    const json = parseObject(aesDecrypt(data, aesKey));
    if (!json) return fail('Sorry, Request Not Processed');
    const mac = text(json.mac_address);
    const uid = text(json.u_id);
    if (!mac || !uid) return fail('Sorry, Request Security Issue Code 2');
    if (!sameText(uid, tvV3Uid(signingKey, aesKey, mac))) {
      return fail('Sorry, Request Security Issue Code 3');
    }

    const result = await this.registerDevice.execute({
      mac,
      appType: text(json.app_type) || 'unknown',
    });
    if (!result.ok) return fail('Sorry, Request Parameters are incomplete');

    const reply = this.deviceInfoReply(result.value.device, result.value.trialDays, ip);
    return { data: aesEncrypt(JSON.stringify(reply), aesKey) };
  }

  /** The fields the old ibo backend sent for TV v3 (sendPlayListInformation). */
  private deviceInfoReply(device: Device, trialDays: number, ip: string) {
    return {
      mac_registered: true,
      urls: [DEMO_PLAYLIST],
      themes: [],
      has_own_playlist: false,
      trial_days: trialDays,
      parent_pin: '0000',
      ip_address: ip,
      notification: { title: '', content: '' },
      languages: [],
      device_key: device.deviceKey,
      is_trial: legacyIsTrial(device),
      expire_date: legacyExpireDate(device),
    };
  }
}
