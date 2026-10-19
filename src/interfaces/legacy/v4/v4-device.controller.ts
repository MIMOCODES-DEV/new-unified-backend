import { Body, Controller, Headers, Logger, Param, Post, Res } from '@nestjs/common';
import {
  GetV4DeviceInfoUseCase,
  LoginV4DeviceUseCase,
  RequestRegistrationCaptchaUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { encodeEnvelope } from '../codecs/envelope.codec.js';
import { decodeXorToken, encodeXorToken } from '../codecs/xor-token.codec.js';
import {
  asBody,
  type JsonBody,
  clientIp,
  header,
  normalize,
  openEnvelope,
  type Reply,
  text,
} from '../legacy-http.js';
import { deviceInfoBody, uidChallengeBody } from './v4.presenter.js';

/** The `{type}` values installed V4 apps call (union of ibo, bob and cr; cr adds ios). */
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
  'ios',
]);

const INVALID_UID = 'Invalid u_id. Must be exactly 6 alphanumeric characters.';

/**
 * The V4 "any device" API of the old backends, wire-compatible for installed apps:
 *   POST /api/{type}/v4/recaptcha    plain JSON
 *   POST /api/{type}/v4/device_login obfuscated envelope `{data}`
 *   POST /api/{type}/v4/device_info  envelope + `Authorization: Bearer <XOR token>`
 * The brand comes from the Host header (TenantMiddleware). All rules live in the devices use cases.
 */
@Controller('api')
export class V4DeviceController {
  private readonly logger = new Logger(V4DeviceController.name);

  constructor(
    private readonly recaptchaUseCase: RequestRegistrationCaptchaUseCase,
    private readonly loginUseCase: LoginV4DeviceUseCase,
    private readonly infoUseCase: GetV4DeviceInfoUseCase,
    private readonly config: AppConfig,
  ) {}

  @LegacyDevice()
  @Post(':type/v4/recaptcha')
  async recaptcha(@Param('type') type: string, @Body() body: unknown, @Res() reply: Reply) {
    const route = routeType(type);
    if (!route) return reply.code(404).send({ status: 'error', message: 'Not found' });
    const req = asBody(body);
    const mac = text(req.mac_address);
    if (!mac) return reply.code(400).send({ status: 'error', message: 'Invalid Data' });
    if (normalize(text(req.app_type) ?? route) !== route) {
      return reply.code(400).send({ status: 'error', message: 'Invalid app_type' });
    }

    const result = await this.recaptchaUseCase.execute({ macAddress: mac });
    if (!result.ok) return reply.code(400).send({ status: 'error', message: 'Invalid Data' });
    if (result.value.kind === 'already_verified') {
      return reply.code(200).send({ status: 'already_verified' });
    }
    return reply
      .code(200)
      .send({ status: 'success', captcha: result.value.svg, token: result.value.token });
  }

  @LegacyDevice()
  @Post(':type/v4/device_login')
  async deviceLogin(@Param('type') type: string, @Body() body: unknown, @Res() reply: Reply) {
    const route = routeType(type);
    if (!route) return reply.code(404).send({ status: 'error', message: 'Not found' });
    const envelope = openEnvelope(body);
    if (!envelope) return reply.code(400).send({ status: 'error', message: 'Invalid Data' });
    const send = (status: number, payload: JsonBody) =>
      reply.code(status).send({ data: encodeEnvelope(payload, envelope) });
    const req = asBody(envelope.json);

    if (normalize(text(req.app_type) ?? '') !== route) {
      return send(200, { status: 'error', message: 'Invalid app_type' });
    }
    const mac = text(req.mac_address);
    if (!mac) return send(200, { status: 'error', message: 'Invalid Data' });
    const tokenKey = this.tokenKey();
    if (!tokenKey) return reply.code(503).send({ status: 'error', message: 'Service unavailable' });

    const result = await this.loginUseCase.execute({
      macAddress: mac,
      appType: route,
      uid: req.u_id,
      recaptchaCode: text(req.recaptcha_code),
      recaptchaToken: text(req.recaptcha_token),
      uidCaptchaCode: text(req.uid_captcha_code),
      uidCaptchaToken: text(req.uid_captcha_token),
    });
    if (!result.ok) {
      switch (result.error.code) {
        case 'devices.invalid_uid':
          return send(200, { status: 'error', message: INVALID_UID });
        case 'devices.captcha_required':
          return send(200, { status: 'error', message: 'Captcha code and token are required' });
        case 'devices.captcha_invalid':
          return send(200, { status: 'error', error_code: 401, message: result.error.message });
        case 'devices.invalid_app_type':
          return send(200, { status: 'error', message: 'Invalid app_type' });
        default:
          return send(200, { status: 'error', message: 'Invalid Data' });
      }
    }
    if (result.value.kind === 'uid_challenge') return send(200, uidChallengeBody(result.value));
    const { device } = result.value;
    return send(200, {
      status: 'success',
      token: encodeXorToken(tokenKey, device.id, device.macAddress.value),
    });
  }

  @LegacyDevice()
  @Post(':type/v4/device_info')
  async deviceInfo(
    @Param('type') type: string,
    @Body() body: unknown,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Res() reply: Reply,
  ) {
    const route = routeType(type);
    if (!route) return reply.code(404).send({ status: 'error', message: 'Not found' });
    const envelope = openEnvelope(body);
    if (!envelope) return reply.code(400).send({ status: 'error', message: 'Invalid Data' });
    const send = (status: number, payload: JsonBody) =>
      reply.code(status).send({ data: encodeEnvelope(payload, envelope) });
    const req = asBody(envelope.json);

    if (normalize(text(req.app_type) ?? '') !== route) {
      return send(200, { status: 'error', message: 'Invalid app_type' });
    }
    const tokenKey = this.tokenKey();
    if (!tokenKey) return reply.code(503).send({ status: 'error', message: 'Service unavailable' });
    const raw = header(headers, 'authorization');
    if (!raw) return send(401, { status: 'error', message: 'Device login token is required' });
    const token = decodeXorToken(tokenKey, raw.replace(/^Bearer\s+/i, '').trim());
    if (!token.ok) return send(403, { status: 'error', message: 'Invalid device login token' });

    const result = await this.infoUseCase.execute({
      tokenDeviceId: token.value.deviceId,
      tokenMac: token.value.mac,
      macAddress: text(req.mac_address),
      uid: req.u_id,
      uidCaptchaCode: text(req.uid_captcha_code),
      uidCaptchaToken: text(req.uid_captcha_token),
    });
    if (!result.ok) {
      switch (result.error.code) {
        case 'devices.not_registered':
          return send(200, { status: 'error', error_code: 404, message: result.error.message });
        case 'devices.invalid_uid':
          return send(200, { status: 'error', message: INVALID_UID });
        case 'devices.token_mac_mismatch':
        case 'kernel.invalid_mac_address':
          return send(403, {
            status: 'error',
            message: 'Token does not match request mac_address',
          });
        default:
          return send(403, { status: 'error', message: 'Invalid device login token' });
      }
    }
    if (result.value.kind === 'uid_challenge') return send(200, uidChallengeBody(result.value));
    const { device, trialDays } = result.value;
    return send(200, deviceInfoBody({ device, trialDays, ipAddress: clientIp(headers) }));
  }

  private tokenKey(): string | undefined {
    const key = this.config.env.LEGACY_TOKEN_KEY;
    if (!key)
      this.logger.error('LEGACY_TOKEN_KEY is not set: legacy V4 routes cannot issue tokens');
    return key;
  }
}

function routeType(type: string): string | null {
  const value = normalize(type);
  return V4_APP_TYPES.has(value) ? value : null;
}
