/**
 * Old-app routes: V4, the login of the current IBO, BobPlayer and CRPlayer apps. Same paths and
 * formats as the old backends, one set per app type in the path (/api/lg/v4/..., ...).
 * - POST recaptcha     plain JSON {mac_address, app_type}
 *     a MAC that solved one before → {status: "already_verified"}; else {status, captcha, token}
 * - POST device_login  {data: <envelope>} {mac_address, app_type, u_id, version,
 *                       recaptcha_code?, recaptcha_token?, uid_captcha_code?, uid_captcha_token?}
 *     → {data: <envelope>} {status: "success", token}   (token = the old XOR device token)
 * - POST device_info   Bearer <token>, {data: <envelope>} → {data: <envelope>} device info
 * A uid that does not match answers {status: "uid_mismatch_captcha", captcha, captcha_token}
 * on both login routes, with a captcha showing the stored uid (DEV-4).
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
  FindDeviceByIdUseCase,
  HasSolvedCaptchaUseCase,
  IssueCaptchaUseCase,
  IssueUidRecoveryCaptchaUseCase,
  LoginV4DeviceUseCase,
  type Platform,
} from '../../../modules/devices/index.js';
import { DeviceLicenseUseCase } from '../../../modules/licensing/index.js';
import { PlaylistReplyUseCase } from '../../../modules/playlists/index.js';
import { GetTenantConfigUseCase } from '../../../modules/tenants/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { Clock } from '../../../shared/kernel/clock.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import { decodeRequest, encodeResponse, randomKey } from './ibo-envelope.js';
import { LegacyErrorFilter } from './legacy-error.filter.js';
import { text } from './legacy-fields.js';
import { legacyLicense, legacyUrls, platformOfPath } from './legacy-reply.js';
import { decodeDeviceToken, encodeDeviceToken } from './xor-device-token.js';

type JsonBody = Record<string, unknown> | undefined;

/** The V4 apps show 4 characters. */
const V4_CAPTCHA_LENGTH = 4;

/** What the old backends answered for each refusal of a V4 login. */
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
  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly context: TenantContext,
    private readonly hasSolved: HasSolvedCaptchaUseCase,
    private readonly issueCaptcha: IssueCaptchaUseCase,
    private readonly issueUidCaptcha: IssueUidRecoveryCaptchaUseCase,
    private readonly login: LoginV4DeviceUseCase,
    private readonly findDevice: FindDeviceByIdUseCase,
    private readonly license: DeviceLicenseUseCase,
    private readonly playlists: PlaylistReplyUseCase,
    private readonly tenantConfig: GetTenantConfigUseCase,
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
    if (!token) return fail(403, 'Invalid device login token');
    // The token is not signed: the device must exist with the same id and MAC.
    const found = await this.findDevice.execute(token.deviceId);
    if (!found.ok || found.value.device.macAddress !== token.mac) {
      return fail(403, 'Invalid device login token');
    }
    if (!request) return reply({ status: 'error' });
    const json = request.json;
    const sent = MacAddress.parse(text(json.mac_address));
    if (sent.ok && sent.value.value !== token.mac) {
      return fail(403, 'Token does not match request mac_address');
    }

    // The same checks as the login (uid, V4 lock), and this visit is recorded.
    const loggedIn = await this.loginOrRefusal({ ...json, mac_address: token.mac }, platform, ip);
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

  /** The device-info fields the old ibo backend sent (getDeviceInfoAnyDevice). */
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
      // The apps treat "off" as parental control off; null would leave their old setting.
      parent_pin: device.parentPin ?? 'off',
      stalker_enabled: device.stalkerEnabled,
      trial_days: config.trial.days,
      has_own_playlist: playlists.hasOwnPlaylist,
      urls: legacyUrls(playlists),
      ip_address: ip,
      // Content (themes, notifications, languages) comes in a later phase.
      themes: [],
      languages: [],
      notification: { title: '', content: '' },
      real_time_notification: '0',
      notification_interval: 300,
    };
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
