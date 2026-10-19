/**
 * Old-app door: the "TV v4" routes CRPlayer calls (same paths and formats as the old cr backend).
 * - POST /api/v4/recaptcha        form mac_address        → plain JSON {status, captcha: <svg>}
 * - POST /api/tv/v4/playlist_info form data=<envelope>, token → {data: <envelope>}
 * Rules:
 * - Both need the app token (Bearer header or "token" field) = LEGACY_TV_API_TOKEN, else 401/403.
 * - playlist_info: the captcha answer must match the MAC's captcha. If not, reply with a NEW
 *   captcha (status "error" + captcha); the app shows it, saves the answer and reloads.
 * - Correct answer → register-or-get the device (trial for a new MAC) and reply in the old shape.
 * - "android" is refused here, like the old backend (Android has its own routes).
 */
import { Body, Controller, Headers, HttpCode, HttpException, Ip, Post } from '@nestjs/common';
import {
  type Device,
  IssueCaptchaUseCase,
  RegisterDeviceUseCase,
  VerifyCaptchaUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { decodeRequest, encodeResponse, randomKey } from './ibo-envelope.js';
import { legacyExpireDate, legacyIsTrial } from './legacy-device.mapper.js';

type FormBody = Record<string, string | undefined> | undefined;

/** A field from the app's JSON, or '' when it is missing or not text. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** The demo playlist the old backend returned: CRPlayer crashes on an empty playlist list. */
const DEMO_PLAYLIST = {
  id: 'demo',
  playlist_name: 'Sample',
  username: '',
  password: '',
  epg_url: '',
  playlist_type: 'general',
  backup_urls: [],
};

@Controller('api')
export class TvV4Controller {
  constructor(
    private readonly config: AppConfig,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly verifyCaptcha: VerifyCaptchaUseCase,
    private readonly registerDevice: RegisterDeviceUseCase,
  ) {}

  @LegacyDevice()
  @Post('v4/recaptcha')
  @HttpCode(200)
  async recaptcha(@Body() body: FormBody, @Headers('authorization') authorization?: string) {
    this.checkToken(authorization, body?.token, (status, message) => {
      throw new HttpException({ status: 'error', message }, status);
    });
    const captcha = await this.issueCaptcha.execute(body?.mac_address ?? '');
    if (!captcha.ok)
      throw new HttpException({ status: 'error', message: 'Invalid MAC address' }, 400);
    return { status: 'success', captcha: captcha.value.svg };
  }

  @LegacyDevice()
  @Post('tv/v4/playlist_info')
  @HttpCode(200)
  async playlistInfo(
    @Body() body: FormBody,
    @Ip() ip: string,
    @Headers('authorization') authorization?: string,
  ) {
    const request = decodeRequest(body?.data);
    const key = request?.key || randomKey();
    const reply = (value: unknown) => ({ data: encodeResponse(value, key) });

    this.checkToken(authorization, body?.token, (status, message) => {
      throw new HttpException(reply({ status: 'error', message }), status);
    });
    if (!request) return reply({ status: 'error' });

    const json = request.json;
    const mac = text(json.mac_address);
    const appType = text(json.app_type);
    if (appType === 'android') return reply({ status: 'error', message: 'error' });

    if (!(await this.verifyCaptcha.execute(mac, text(json.recaptcha_code)))) {
      const captcha = await this.issueCaptcha.execute(mac);
      if (!captcha.ok) return reply({ status: 'error', message: 'Invalid MAC address' });
      const message = json.recaptcha_code ? 'Invalid captcha code' : 'Captcha required';
      return reply({ status: 'error', message, captcha: captcha.value.svg });
    }

    const result = await this.registerDevice.execute({ mac, appType });
    if (!result.ok) return reply({ status: 'error', message: result.error.message });
    return reply(this.playlistInfoReply(result.value.device, result.value.trialDays, ip));
  }

  /** The exact fields the old cr backend sent (recorded in test/fixtures/legacy/http/cr-unified.json). */
  private playlistInfoReply(device: Device, trialDays: number, ip: string) {
    return {
      has_own_playlist: false,
      mac_registered: true,
      ip_address: ip,
      urls: [DEMO_PLAYLIST],
      themes: [],
      notifications: [],
      trial_days: trialDays,
      device_key: device.deviceKey,
      is_trial: legacyIsTrial(device),
      expire_date: legacyExpireDate(device),
      recovery_code_enabled: false,
      parent_pin: '0000',
      apiVersion: 'v4',
      status: 'success',
      is_expired: false,
      languages: [],
    };
  }

  private checkToken(
    authorization: string | undefined,
    bodyToken: string | undefined,
    fail: (status: number, message: string) => never,
  ): void {
    const raw = authorization ?? bodyToken;
    if (!raw) fail(401, 'Tv key token is required');
    const token = raw.startsWith('Bearer ') ? raw.slice(7) : raw;
    const expected = this.config.env.LEGACY_TV_API_TOKEN;
    if (!expected || token !== expected) fail(403, 'Invalid TV key token');
  }
}
