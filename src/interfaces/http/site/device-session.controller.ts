import { Body, Controller, Delete, Get, HttpCode, Ip, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import {
  AnswerWebCaptchaUseCase,
  ChangeDeviceKeyUseCase,
  FindDeviceByIdUseCase,
  SetDeviceUidUseCase,
  SetParentPinUseCase,
  VerifyDeviceKeyUseCase,
} from '../../../modules/devices/index.js';
import {
  CreateRecoveryCodeUseCase,
  DeviceLicenseUseCase,
  SwitchMacUseCase,
} from '../../../modules/licensing/index.js';
import {
  AddPlaylistUseCase,
  DashboardPlaylistsUseCase,
  DeletePlaylistUseCase,
  EditPlaylistUseCase,
  UnlockPlaylistUseCase,
} from '../../../modules/playlists/index.js';
import { DeviceSession, Public } from '../../../shared/auth/access.decorators.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { SessionStore } from '../../../shared/auth/session-store.js';
import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { RedisRateLimiter } from '../../../shared/redis/redis-rate-limiter.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import {
  BAD_REQUEST,
  CONFLICT,
  fail,
  FORBIDDEN,
  limit,
  NOT_FOUND,
  parse,
  UNAUTHORIZED,
  unwrap,
} from '../accounts/http-results.js';
import { captchaAnswer, playlistSource } from './site-schemas.js';
import { deviceView, licenseView, playlistView } from './site-views.js';

/** How long a TV stays logged in on the brand site. */
const SESSION_MS = 24 * 60 * 60 * 1000;
/** Login tries per IP and per MAC: a device key is only 6 digits, and each try needs a captcha. */
const LOGIN_LIMIT = { limit: 10, windowMs: 15 * 60 * 1000 };

const STATUSES = {
  'devices.invalid_captcha': BAD_REQUEST,
  'devices.device_key_mismatch': UNAUTHORIZED,
  'devices.not_found': NOT_FOUND,
  'devices.invalid_device_key': BAD_REQUEST,
  'devices.invalid_parent_pin': BAD_REQUEST,
  'devices.invalid_uid': BAD_REQUEST,
  'playlists.not_found': NOT_FOUND,
  'playlists.invalid_playlist': BAD_REQUEST,
  'playlists.invalid_pin': BAD_REQUEST,
  'playlists.pin_required': FORBIDDEN,
  'playlists.wrong_pin': FORBIDDEN,
  'playlists.exists': CONFLICT,
  'playlists.name_taken': CONFLICT,
  'licensing.device_not_found': NOT_FOUND,
  'licensing.invalid_mac': BAD_REQUEST,
  'licensing.same_mac': BAD_REQUEST,
  'licensing.mac_taken': CONFLICT,
};

const pin = z.string().max(16).nullable().optional();

/**
 * The brand site's device dashboard: a TV logs in with its MAC, its device key (shown on the TV)
 * and a captcha, then manages its playlists, device key, parental PIN, MAC switch and recovery
 * code. The brand comes from the host; a session works on its own brand only.
 */
@Controller('device')
export class DeviceSessionController {
  constructor(
    private readonly answerCaptcha: AnswerWebCaptchaUseCase,
    private readonly verifyKey: VerifyDeviceKeyUseCase,
    private readonly findDevice: FindDeviceByIdUseCase,
    private readonly changeKey: ChangeDeviceKeyUseCase,
    private readonly setParentPin: SetParentPinUseCase,
    private readonly setUid: SetDeviceUidUseCase,
    private readonly license: DeviceLicenseUseCase,
    private readonly switchMac: SwitchMacUseCase,
    private readonly recoveryCode: CreateRecoveryCodeUseCase,
    private readonly dashboard: DashboardPlaylistsUseCase,
    private readonly addPlaylist: AddPlaylistUseCase,
    private readonly editPlaylist: EditPlaylistUseCase,
    private readonly deletePlaylist: DeletePlaylistUseCase,
    private readonly unlockPlaylist: UnlockPlaylistUseCase,
    private readonly sessions: SessionStore,
    private readonly limiter: RedisRateLimiter,
    private readonly auth: AuthContext,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * MAC + device key + a site captcha (GET /site/captcha). An unknown MAC and a wrong key get the
   * same answer; the captcha is used up either way.
   */
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.object({ mac: z.string().max(64), deviceKey: z.string().max(32), captcha: captchaAnswer }),
      body,
    );
    const brand = this.tenant.current.id;
    await limit(
      this.limiter,
      LOGIN_LIMIT,
      `site:device-login-ip:${brand}:${ip}`,
      `site:device-login-mac:${brand}:${input.mac.trim().toLowerCase()}`,
    );
    unwrap(await this.answerCaptcha.execute(input.captcha), STATUSES);
    const mac = MacAddress.parse(input.mac);
    if (!mac.ok) {
      throw fail(
        UNAUTHORIZED,
        'devices.device_key_mismatch',
        'MAC address or device key is not correct',
      );
    }
    const found = unwrap(
      await this.verifyKey.execute({ mac: mac.value, key: input.deviceKey.trim() }),
      STATUSES,
    );
    const token = await this.sessions.create(
      { kind: 'device', id: found.device.id, tenantId: brand },
      SESSION_MS,
    );
    return { token, device: deviceView(found) };
  }

  @DeviceSession()
  @Post('logout')
  @HttpCode(200)
  async logout() {
    await this.sessions.revoke(this.auth.device().token);
    return { loggedOut: true };
  }

  /** The device, what its license allows now, and its playlists. */
  @DeviceSession()
  @Get()
  async me() {
    const deviceId = this.auth.device().deviceId;
    const found = unwrap(await this.findDevice.execute(deviceId), STATUSES);
    const license = unwrap(await this.license.execute(deviceId), STATUSES);
    const playlists = await this.dashboard.execute(deviceId);
    return {
      device: deviceView(found),
      license: licenseView(license),
      playlists: playlists.map(playlistView),
    };
  }

  /** A new device key: the one typed, or a random one when `key` is null. */
  @DeviceSession()
  @Patch('key')
  async deviceKey(@Body() body: unknown) {
    const { key } = parse(z.object({ key: z.string().max(32).nullable() }), body);
    const deviceId = this.auth.device().deviceId;
    return unwrap(await this.changeKey.execute({ deviceId, key }), STATUSES);
  }

  /** Parental control: 4 digits turn it on (or change the PIN); null turns it off. */
  @DeviceSession()
  @Patch('parent-pin')
  async parentPin(@Body() body: unknown) {
    const input = parse(z.object({ pin: z.string().max(16).nullable() }), body);
    const deviceId = this.auth.device().deviceId;
    return unwrap(await this.setParentPin.execute({ deviceId, pin: input.pin }), STATUSES);
  }

  /** The uid the reinstalled app now shows, so its next login skips the uid captcha. */
  @DeviceSession()
  @Patch('uid')
  async deviceUid(@Body() body: unknown) {
    const { uid } = parse(z.object({ uid: z.string().max(32) }), body);
    const deviceId = this.auth.device().deviceId;
    return unwrap(await this.setUid.execute({ deviceId, uid }), STATUSES);
  }

  /** Moves a lifetime license to a new TV (DEV-7). The new TV must have opened the app once. */
  @DeviceSession()
  @Post('switch-mac')
  @HttpCode(200)
  async switchToMac(@Body() body: unknown) {
    const { newMac } = parse(z.object({ newMac: z.string().max(64) }), body);
    const deviceId = this.auth.device().deviceId;
    return unwrap(await this.switchMac.execute({ deviceId, newMac }), STATUSES);
  }

  /** A code typed on a new TV to move this paid device there (REC-1); 30 minutes. */
  @DeviceSession()
  @Post('recovery-code')
  @HttpCode(200)
  async newRecoveryCode() {
    const deviceId = this.auth.device().deviceId;
    return unwrap(await this.recoveryCode.execute({ deviceId }), STATUSES);
  }

  @DeviceSession()
  @Get('playlists')
  async playlists() {
    const playlists = await this.dashboard.execute(this.auth.device().deviceId);
    return { playlists: playlists.map(playlistView) };
  }

  /** With a PIN it is saved protected (PL-3). */
  @DeviceSession()
  @Post('playlists')
  async addOne(@Body() body: unknown) {
    const input = parse(
      z.object({
        name: z.string().max(200),
        source: playlistSource,
        epgUrl: z.string().max(2048).nullable().optional(),
        pin,
      }),
      body,
    );
    const playlist = unwrap(
      await this.addPlaylist.execute({
        deviceId: this.auth.device().deviceId,
        ...input,
        addedBy: { via: 'website', resellerId: null },
      }),
      STATUSES,
    );
    return { playlist: playlistView(playlist) };
  }

  /**
   * Only what is sent changes. A protected playlist needs its `pin`; `newPin` protects it, changes
   * the PIN, or (null) removes the protection.
   */
  @DeviceSession()
  @Patch('playlists/:id')
  async editOne(@Param('id') playlistId: string, @Body() body: unknown, @Ip() ip: string) {
    const input = parse(
      z.object({
        pin,
        name: z.string().max(200).optional(),
        source: playlistSource.optional(),
        epgUrl: z.string().max(2048).nullable().optional(),
        newPin: pin,
      }),
      body,
    );
    const playlist = unwrap(
      await this.editPlaylist.execute({
        deviceId: this.auth.device().deviceId,
        playlistId,
        by: 'dashboard',
        ip,
        ...input,
      }),
      STATUSES,
    );
    return { playlist: playlistView(playlist) };
  }

  /** A protected playlist needs its PIN. */
  @DeviceSession()
  @Delete('playlists/:id')
  async deleteOne(@Param('id') playlistId: string, @Body() body: unknown) {
    const input = parse(z.object({ pin }).optional(), body ?? undefined) ?? {};
    unwrap(
      await this.deletePlaylist.execute({
        deviceId: this.auth.device().deviceId,
        playlistId,
        by: 'dashboard',
        ...input,
      }),
      STATUSES,
    );
    return { deleted: true };
  }

  /** Shows a protected playlist's link, login or portal, with its PIN. */
  @DeviceSession()
  @Post('playlists/:id/unlock')
  @HttpCode(200)
  async unlock(@Param('id') playlistId: string, @Body() body: unknown) {
    const input = parse(z.object({ pin: z.string().max(16) }), body);
    const playlist = unwrap(
      await this.unlockPlaylist.execute({
        deviceId: this.auth.device().deviceId,
        playlistId,
        pin: input.pin,
      }),
      STATUSES,
    );
    return { playlist: playlistView({ ...playlist, hidden: undefined }) };
  }
}
