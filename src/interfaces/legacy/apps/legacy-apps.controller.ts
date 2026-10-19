import { Body, Controller, Headers, Logger, Param, Post, Res } from '@nestjs/common';
import {
  DeviceSettings,
  LoginAppDeviceUseCase,
  RegisterOrGetDeviceUseCase,
} from '../../../modules/devices/index.js';
import { LegacyDevice } from '../../../shared/auth/access.decorators.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { decryptPassphrase, encryptPassphrase } from '../codecs/aes-passphrase.codec.js';
import { encodeEnvelope } from '../codecs/envelope.codec.js';
import { verifyRequestSignature } from '../codecs/hmac-signature.js';
import { encodeXorToken } from '../codecs/xor-token.codec.js';
import {
  asBody,
  clientIp,
  type JsonBody,
  normalize,
  openEnvelope,
  type Reply,
  type RequestHeaders,
  text,
} from '../legacy-http.js';
import {
  type AppDeviceView,
  appLoginBody,
  playlistInfoBody,
  registerDeviceBody,
  signedAndroidBody,
} from './legacy-apps.presenter.js';

/** The device fields the presenters read, from the devices module's entity. */
interface DeviceLike {
  id: string;
  macAddress: { value: string };
  deviceKey: string;
  isPaid: boolean;
  trialExpiresAt: Date;
  activatedAt: Date | null;
  createdAt: Date;
}

const INCORRECT_MAC = { error: true, message: 'incorrect mac-address!', status: 404 };
const UID_MISMATCH = { error: true, message: 'Device UID mismatch!', status: 403 };
const UNAVAILABLE = { status: 'error', message: 'Service unavailable' };

/** The `{platform}/{version}` pairs of the iOS/Android apps' `device_login`. */
const APP_PLATFORMS = new Set(['ios', 'android']);
const APP_VERSIONS = new Set(['v2', 'v3']);

/**
 * The registration routes of the old apps (before V4), wire-compatible for installed apps:
 *   POST /api/playlist_info                                legacy TV, obfuscated envelope (form `data`)
 *   POST /api/MBBPj5UwlCmTstXGb/android/playlist_information  signed Android, AES + HMAC signature
 *   POST /api/Mxcvfghytrhjsjj/tv/playlist_information      bob's alias of the signed route
 *   POST /api/device_login, /api/register_device           Roku
 *   POST /api/{ios|android}/{v2|v3}/device_login           iOS/Android apps (install uid)
 * Each brand answers in its old backend's shapes (its legacy profile). All device rules live in
 * the devices use cases; this controller only decodes, maps errors and encodes.
 */
@Controller('api')
export class LegacyAppsController {
  private readonly logger = new Logger(LegacyAppsController.name);

  constructor(
    private readonly register: RegisterOrGetDeviceUseCase,
    private readonly appLogin: LoginAppDeviceUseCase,
    private readonly settings: DeviceSettings,
    private readonly config: AppConfig,
  ) {}

  @LegacyDevice()
  @Post('playlist_info')
  async playlistInfo(
    @Body() body: unknown,
    @Headers() headers: RequestHeaders,
    @Res() reply: Reply,
  ) {
    const envelope = openEnvelope(body);
    if (!envelope) return reply.code(400).send({ status: 'error', message: 'Invalid Data' });
    const profile = await this.settings.legacyProfile();
    const send = (payload: JsonBody) =>
      reply.code(200).send({
        data: encodeEnvelope(payload, envelope),
        ...(profile === 'bob' ? { languages: [] } : {}), // bob sent languages next to `data`
      });

    const req = asBody(envelope.json);
    const result = await this.register.execute({
      macAddress: text(req.mac_address),
      appType: text(req.app_type) ?? 'android',
      appDeviceId: text(req.app_device_id),
    });
    if (!result.ok) return send({ status: 'error', message: 'Invalid Data' });
    return send(
      playlistInfoBody(profile, {
        device: view(result.value.device),
        created: result.value.outcome === 'created',
        trialDays: (await this.settings.trialDays()).days,
        ipAddress: clientIp(headers),
      }),
    );
  }

  @LegacyDevice()
  @Post([
    'MBBPj5UwlCmTstXGb/android/playlist_information',
    'Mxcvfghytrhjsjj/tv/playlist_information',
  ])
  async signedAndroid(
    @Body() body: unknown,
    @Headers() headers: RequestHeaders,
    @Res() reply: Reply,
  ) {
    const { ANDROID_SIGNING_SECRET: signingSecret, ANDROID_AES_NEW_SECRET: aesSecret } =
      this.config.env;
    if (!signingSecret || !aesSecret) {
      this.logger.error('ANDROID_SIGNING_SECRET / ANDROID_AES_NEW_SECRET are not set');
      return reply.code(503).send(UNAVAILABLE);
    }
    const refuse = (msg: string) => reply.code(200).send({ status: 'error', msg });

    const req = asBody(body);
    const data = typeof req.data === 'string' ? req.data : '';
    const signature = text(req.signature);
    if (!signature) return refuse('Sorry, Request Unauthorized');
    if (!verifyRequestSignature(signingSecret, data, signature)) {
      return refuse('Sorry, Request Security Issue');
    }
    const json = parseJson(decryptPassphrase(data, aesSecret));
    if (!json) return refuse('Sorry, Request Not Processed');

    const result = await this.register.execute({
      macAddress: text(json.mac_address),
      appType: text(json.app_type) ?? 'android',
      appDeviceId: text(json.app_device_id),
    });
    if (!result.ok) return refuse('Sorry, Request Not Processed');
    const profile = await this.settings.legacyProfile();
    const payload = signedAndroidBody(profile, {
      device: view(result.value.device),
      created: result.value.outcome === 'created',
      trialDays: (await this.settings.trialDays()).days,
      ipAddress: clientIp(headers),
    });
    return reply.code(200).send({ data: encryptPassphrase(JSON.stringify(payload), aesSecret) });
  }

  @LegacyDevice()
  @Post('device_login')
  async rokuLogin(@Body() body: unknown, @Res() reply: Reply) {
    return this.roku(body, reply, (token, device) =>
      appLoginBody({ token, device, withPlaylists: true }),
    );
  }

  @LegacyDevice()
  @Post('register_device')
  async rokuRegister(@Body() body: unknown, @Res() reply: Reply) {
    return this.roku(body, reply, (token, device) => registerDeviceBody({ token, device }));
  }

  @LegacyDevice()
  @Post(':platform/:version/device_login')
  async appDeviceLogin(
    @Param('platform') platform: string,
    @Param('version') version: string,
    @Body() body: unknown,
    @Res() reply: Reply,
  ) {
    if (!APP_PLATFORMS.has(normalize(platform)) || !APP_VERSIONS.has(normalize(version))) {
      return reply.code(404).send({ status: 'error', message: 'Not found' });
    }
    const req = asBody(body);
    const mac = text(req.mac);
    if (!mac || req.uid === undefined || req.uid === '') return reply.code(200).send(INCORRECT_MAC);
    const tokenKey = this.tokenKey();
    if (!tokenKey) return reply.code(503).send(UNAVAILABLE);

    const result = await this.appLogin.execute({
      macAddress: mac,
      appType: text(req.app_type) ?? normalize(platform),
      uid: req.uid,
    });
    if (!result.ok) {
      return reply
        .code(200)
        .send(result.error.code === 'devices.uid_mismatch' ? UID_MISMATCH : INCORRECT_MAC);
    }
    const device = view(result.value.device);
    const token = encodeXorToken(tokenKey, device.id, device.macAddress);
    return reply.code(200).send(appLoginBody({ token, device, withPlaylists: false }));
  }

  private async roku(
    body: unknown,
    reply: Reply,
    present: (token: string, device: AppDeviceView) => JsonBody,
  ) {
    const mac = text(asBody(body).mac);
    if (!mac) return reply.code(200).send(INCORRECT_MAC);
    const tokenKey = this.tokenKey();
    if (!tokenKey) return reply.code(503).send(UNAVAILABLE);

    const result = await this.register.execute({ macAddress: mac, appType: 'roku' });
    if (!result.ok) return reply.code(200).send(INCORRECT_MAC);
    const device = view(result.value.device);
    return reply
      .code(200)
      .send(present(encodeXorToken(tokenKey, device.id, device.macAddress), device));
  }

  private tokenKey(): string | undefined {
    const key = this.config.env.LEGACY_TOKEN_KEY;
    if (!key)
      this.logger.error('LEGACY_TOKEN_KEY is not set: legacy app routes cannot issue tokens');
    return key;
  }
}

function view(device: DeviceLike): AppDeviceView {
  return {
    id: device.id,
    macAddress: device.macAddress.value,
    deviceKey: device.deviceKey,
    isPaid: device.isPaid,
    trialExpiresAt: device.trialExpiresAt,
    activatedAt: device.activatedAt,
    createdAt: device.createdAt,
  };
}

function parseJson(decrypted: { ok: true; value: string } | { ok: false }): JsonBody | null {
  if (!decrypted.ok) return null;
  try {
    const parsed: unknown = JSON.parse(decrypted.value);
    return parsed !== null && typeof parsed === 'object' ? asBody(parsed) : null;
  } catch {
    return null;
  }
}
