/**
 * Old-app door: the V4 routes BobPlayer calls, one set per app type in the path
 * (/api/lg/v4/..., /api/samsung/v4/...). Same paths and formats as the old bob backend.
 * - POST recaptcha     plain JSON {mac_address, app_type}
 *     verified device → {status: "already_verified"}; otherwise {status, captcha: <svg>, token}
 * - POST device_login  {data: <envelope>} {mac_address, app_type, u_id, recaptcha_code, recaptcha_token}
 *     → {data: <envelope>} {status: "success", token}  (token = XOR device token)
 * - POST device_info   Bearer <token>, {data: <envelope>} → {data: <envelope>} device info
 * Rules:
 * - The app_type in the body must equal the one in the path.
 * - device_info: the token's device must exist with the same id, MAC and app type, and the
 *   request's MAC must be the token's MAC. Anything else → 401/403, like the old backend.
 */
import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpException,
  Ip,
  NotFoundException,
  Param,
  Post,
  UseFilters,
} from '@nestjs/common';
import {
  type Device,
  GetDeviceUseCase,
  IsCaptchaVerifiedUseCase,
  IssueCaptchaUseCase,
  LoginV4DeviceUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { decodeRequest, encodeResponse, randomKey } from './ibo-envelope.js';
import { legacyExpireDate, legacyIsTrial } from './legacy-device.mapper.js';
import { decodeDeviceToken, encodeDeviceToken } from './xor-device-token.js';

/** The app types the old V4 routes exist for (bob routes/api.js). */
const V4_APP_TYPES = new Set([
  'android',
  'samsung',
  'lg',
  'vidaa',
  'zeasn',
  'philips',
  'titanos',
  'vegaos',
  'android_tv',
  'windows',
  'macos',
  'linux',
]);

/** BobPlayer shows 4 characters and sends the token back with the answer. */
const V4_CAPTCHA = { length: 4, width: 300, withToken: true };

const DEMO_PLAYLIST = {
  id: 'demo',
  playlist_name: 'Sample',
  url: '',
  username: '',
  password: '',
  playlist_type: 'general',
};

type JsonBody = Record<string, unknown> | undefined;

/** A field from the app's JSON, or '' when it is missing or not text. */
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Error messages the old backend sent, by our error code. */
const LOGIN_ERRORS: Record<string, { message: string; error_code?: number }> = {
  'kernel.invalid_mac_address': { message: 'Invalid Data' },
  'devices.invalid_uid': { message: 'Invalid u_id. Must be exactly 6 alphanumeric characters.' },
  'devices.captcha_required': { message: 'Captcha code and token are required' },
  'devices.invalid_captcha': {
    message: 'Invalid or expired captcha. Please request a new captcha and try again.',
    error_code: 401,
  },
};

@UseFilters(LegacyErrorFilter)
@Controller('api/:appType/v4')
export class V4DeviceController {
  constructor(
    private readonly config: AppConfig,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly isVerified: IsCaptchaVerifiedUseCase,
    private readonly login: LoginV4DeviceUseCase,
    private readonly getDevice: GetDeviceUseCase,
  ) {}

  @LegacyDevice()
  @Post('recaptcha')
  @HttpCode(200)
  async recaptcha(@Param('appType') pathType: string, @Body() body: JsonBody) {
    const appType = this.appTypeFromPath(pathType);
    const mac = text(body?.mac_address);
    if (!mac) throw new HttpException({ status: 'error', message: 'Invalid Data' }, 400);
    if ((text(body?.app_type) || appType).toLowerCase() !== appType) {
      throw new HttpException({ status: 'error', message: 'Invalid app_type' }, 400);
    }
    const known = await this.getDevice.execute(mac);
    if (known && (await this.isVerified.execute(mac))) return { status: 'already_verified' };

    const captcha = await this.issueCaptcha.execute(mac, V4_CAPTCHA);
    if (!captcha.ok) throw new HttpException({ status: 'error', message: 'Invalid Data' }, 400);
    return { status: 'success', captcha: captcha.value.svg, token: captcha.value.token };
  }

  @LegacyDevice()
  @Post('device_login')
  @HttpCode(200)
  async deviceLogin(@Param('appType') pathType: string, @Body() body: JsonBody) {
    const appType = this.appTypeFromPath(pathType);
    const request = decodeRequest(body?.data);
    const reply = (value: unknown) => ({
      data: encodeResponse(value, request?.key || randomKey()),
    });
    if (!request) return reply({ status: 'error' });
    const json = request.json;
    if (text(json.app_type).toLowerCase() !== appType) {
      return reply({ status: 'error', message: 'Invalid app_type' });
    }

    const result = await this.login.execute({
      mac: text(json.mac_address),
      appType,
      uid: text(json.u_id),
      captchaCode: text(json.recaptcha_code) || undefined,
      captchaToken: text(json.recaptcha_token) || undefined,
    });
    if (!result.ok) {
      if (result.error.code === 'devices.uid_mismatch') {
        // The old backend answers with a second captcha here; not built yet.
        return reply({ status: 'error', error_code: 401, message: 'Device ID mismatch' });
      }
      return reply({
        status: 'error',
        ...(LOGIN_ERRORS[result.error.code] ?? { message: 'error' }),
      });
    }
    const device = result.value;
    return reply({
      status: 'success',
      token: encodeDeviceToken(this.tokenKey(), device.id, device.mac.value),
    });
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
    const appType = this.appTypeFromPath(pathType);
    const request = decodeRequest(body?.data);
    const reply = (value: unknown) => ({
      data: encodeResponse(value, request?.key || randomKey()),
    });
    const fail = (status: number, message: string): never => {
      const payload = { status: 'error', message };
      throw new HttpException(request ? reply(payload) : payload, status);
    };

    if (!authorization) fail(401, 'Device login token is required');
    const raw = authorization!.startsWith('Bearer ') ? authorization!.slice(7) : authorization!;
    const token = decodeDeviceToken(this.tokenKey(), raw);
    if (!token) fail(403, 'Invalid device login token');

    const found = await this.getDevice.execute(token!.mac);
    if (!found || found.device.id !== token!.deviceId || found.device.appType !== appType) {
      fail(403, 'Invalid device login token');
    }
    if (request && text(request.json.mac_address).toLowerCase() !== token!.mac) {
      fail(403, 'Token does not match request mac_address');
    }
    return reply(this.deviceInfoReply(found!.device, found!.trialDays, ip));
  }

  /** The fields the old bob backend sent (recorded in test/fixtures/legacy/http/bobplayer.json). */
  private deviceInfoReply(device: Device, trialDays: number, ip: string) {
    return {
      has_own_playlist: false,
      mac_registered: true,
      ip_address: ip,
      real_time_notification: '0',
      notification_interval: 300,
      notification: { title: '', content: '' },
      urls: [DEMO_PLAYLIST],
      themes: [],
      trial_days: trialDays,
      status: 'success',
      is_expired: false,
      device_key: device.deviceKey,
      is_trial: legacyIsTrial(device),
      expire_date: legacyExpireDate(device),
      parent_pin: '0000',
      languages: [],
    };
  }

  private appTypeFromPath(pathType: string): string {
    const appType = pathType.toLowerCase();
    if (!V4_APP_TYPES.has(appType)) throw new NotFoundException();
    return appType;
  }

  private tokenKey(): string {
    const key = this.config.env.LEGACY_DEVICE_TOKEN_KEY;
    if (!key)
      throw new HttpException({ status: 'error', message: 'V4 login is not configured' }, 503);
    return key;
  }
}
