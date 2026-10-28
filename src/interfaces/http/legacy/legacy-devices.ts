/**
 * What the old (pre-V4) app routes share: register or find the calling device, then gather what
 * their replies show (license, playlists, trial length). The rules stay in the modules: a new
 * device gets a trial (DEV-1), a V4 device is refused by these older routes (DEV-6).
 */
import { HttpException, Injectable } from '@nestjs/common';
import {
  type FoundDevice,
  FindDeviceByTokenIdUseCase,
  type Platform,
  RegisterDeviceUseCase,
} from '../../../modules/devices/index.js';
import { DeviceLicenseUseCase } from '../../../modules/licensing/index.js';
import { PlaylistReplyUseCase } from '../../../modules/playlists/index.js';
import { GetTenantConfigUseCase, GetTenantSecretUseCase } from '../../../modules/tenants/index.js';
import { AppConfig } from '../../../shared/config/app-config.js';
import { Clock } from '../../../shared/kernel/clock.js';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { TenantContext } from '../../../shared/tenancy/tenant-context.js';
import type { LegacyDeviceInfo } from './legacy-info.js';
import { decodeDeviceToken, encodeDeviceToken } from './xor-device-token.js';

/** The app keys of the old routes, kept per brand (each old backend had its own). */
export const LEGACY_KEYS = {
  /** AES passphrase of `playlist_information` and `check_active_status` (old ANDROID_AES_SECRET). */
  androidAes: 'legacy.androidAesSecret',
  /** AES passphrase of the signed v2 routes (old ANDROID_AES_NEW_SECRET). */
  androidAesNew: 'legacy.androidAesNewSecret',
  /** HMAC key of the signed routes (old ANDROID_SIGNING_SECRET). */
  androidSigning: 'legacy.androidSigningSecret',
  /** ibo's signed TV v3 route: AES passphrase and HMAC key (old TV_AES_NEW_SECRET, TV_SIGNING_SECRET). */
  tvAes: 'legacy.tvAesSecret',
  tvSigning: 'legacy.tvSigningSecret',
  /** The static key CRPlayer sends to `tv/v4/playlist_info` (old TV_KEY_V4). */
  tvKey: 'legacy.tvKey',
} as const;

export interface LegacyCall {
  mac: MacAddress | null;
  appDeviceId: string | null;
  uid: string | null;
  platform: Platform;
  appVersion: string | null;
  ip: string;
  /** Roku and the mobile apps get each playlist's PIN, as before. */
  includePins: boolean;
  /** CRPlayer's TV route counts as V4: the older TV routes refuse its devices after. */
  apiVersion?: 'legacy' | 'v4';
}

export type LegacyRefusal = 'v4_device' | 'other_platform' | 'no_device_id';

@Injectable()
export class LegacyDevices {
  constructor(
    private readonly config: AppConfig,
    private readonly clock: Clock,
    private readonly context: TenantContext,
    private readonly register: RegisterDeviceUseCase,
    private readonly findByToken: FindDeviceByTokenIdUseCase,
    private readonly license: DeviceLicenseUseCase,
    private readonly playlists: PlaylistReplyUseCase,
    private readonly tenantConfig: GetTenantConfigUseCase,
    private readonly secrets: GetTenantSecretUseCase,
  ) {}

  /** The brand's settings for the old routes. */
  settings() {
    return this.context.current.settings.legacy;
  }

  /** A brand app key, or null when the brand has none set (the route then cannot answer). */
  key(name: (typeof LEGACY_KEYS)[keyof typeof LEGACY_KEYS]): Promise<string | null> {
    return this.secrets.execute(this.context.current.id, name);
  }

  /** DEV-1: finds the calling device or makes it with a trial, and gathers its reply. */
  async visit(call: LegacyCall): Promise<Result<LegacyDeviceInfo, LegacyRefusal>> {
    const registered = await this.register.execute({
      mac: call.mac,
      platform: call.platform,
      appDeviceId: call.appDeviceId,
      uid: call.uid,
      ip: call.ip,
      appVersion: call.appVersion,
      apiVersion: call.apiVersion ?? 'legacy',
    });
    if (!registered.ok) {
      const code = registered.error.code;
      return err(
        code === 'devices.older_api_refused'
          ? 'v4_device'
          : code === 'devices.platform_mismatch'
            ? 'other_platform'
            : 'no_device_id',
      );
    }
    const { found, created, reviewBuild } = registered.value;
    return ok(await this.gather(found, { created, reviewBuild, call }));
  }

  /** The reply of a device found another way (a token), without recording a visit. */
  async info(
    found: FoundDevice,
    call: Pick<LegacyCall, 'platform' | 'appVersion' | 'ip' | 'includePins'>,
  ): Promise<LegacyDeviceInfo> {
    return this.gather(found, { created: false, reviewBuild: false, call });
  }

  /**
   * The device of an old token (`Authorization`, with or without `Bearer `). Unlike the old
   * routes, which looked the MAC up alone, the device must exist with the token's id and MAC.
   */
  async byToken(authorization: string | undefined): Promise<FoundDevice | null> {
    if (!authorization) return null;
    const raw = authorization.startsWith('Bearer ') ? authorization.slice(7) : authorization;
    const token = decodeDeviceToken(this.tokenKey(), raw.trim());
    if (!token) return null;
    const found = await this.findByToken.execute(token.deviceId);
    return found.ok && found.value.device.macAddress === token.mac ? found.value : null;
  }

  token(device: { id: string; macAddress: string }): string {
    return encodeDeviceToken(this.tokenKey(), device.id, device.macAddress);
  }

  private async gather(
    found: FoundDevice,
    options: {
      created: boolean;
      reviewBuild: boolean;
      call: Pick<LegacyCall, 'platform' | 'appVersion' | 'ip' | 'includePins'>;
    },
  ): Promise<LegacyDeviceInfo> {
    const { device } = found;
    const [license, playlists, config] = await Promise.all([
      this.license.execute(device.id),
      this.playlists.execute({
        deviceId: device.id,
        platform: options.call.platform,
        appVersion: options.call.appVersion,
        stalkerEnabled: device.stalkerEnabled,
        includePins: options.call.includePins,
      }),
      this.tenantConfig.execute(this.context.current),
    ]);
    if (!license.ok) throw new HttpException({ status: 'error', message: 'Invalid Data' }, 404);
    return {
      device,
      created: options.created,
      reviewBuild: options.reviewBuild,
      license: license.value,
      playlists,
      trialDays: config.trial.days,
      ip: options.call.ip,
      now: this.clock.now(),
    };
  }

  private tokenKey(): string {
    const key = this.config.env.LEGACY_DEVICE_TOKEN_KEY;
    if (!key) {
      throw new HttpException({ status: 'error', message: 'Old app login is not configured' }, 503);
    }
    return key;
  }
}
