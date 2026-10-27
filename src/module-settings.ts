import {
  ApplyLicenseUseCase,
  ChangePlaylistCountUseCase,
  type DeviceSettings,
  DevicesModule,
  FindDeviceByIdUseCase,
  FindDeviceUseCase,
} from './modules/devices/index.js';
import {
  type LicensedDevices,
  type LicenseLock,
  LicensingModule,
} from './modules/licensing/index.js';
import {
  type MacOnlyRateLimit,
  PLAYLIST_PIN_KEY_SECRET,
  type PlaylistBrand,
  type PlaylistDevices,
  type PlaylistPinKey,
  PlaylistsModule,
} from './modules/playlists/index.js';
import {
  GetTenantConfigUseCase,
  GetTenantSecretUseCase,
  TenantsModule,
} from './modules/tenants/index.js';
import { RedisLock } from './shared/redis/redis-lock.js';
import { RedisRateLimiter } from './shared/redis/redis-rate-limiter.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

/** An activation holds its device this long at most; a second one waits for it. */
const LICENSE_LOCK = { ttlMs: 10_000, waitMs: 5_000 };

/** Adding or deleting playlists by MAC alone: calls per IP and brand, per 10 minutes. */
const MAC_ONLY_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

/**
 * Feature modules wired to each other and to the brand config. A module may not import another
 * module, so what each one needs from another is bound here, once for every process.
 */
export const DevicesWithBrandConfig = DevicesModule.forRootAsync({
  imports: [TenantsModule],
  settings: {
    inject: [GetTenantConfigUseCase, TenantContext],
    useFactory: (getConfig: GetTenantConfigUseCase, context: TenantContext): DeviceSettings => ({
      trialDays: async () => (await getConfig.execute(context.current)).trial.days,
      reviewBuilds: async () => (await getConfig.execute(context.current)).review.builds,
    }),
  },
});

/**
 * Playlists find devices by MAC, keep the trial devices' playlist counters in step, encrypt PINs
 * with the brand secret `playlists.pinKey`, and shape replies by the brand's settings and config.
 */
export const PlaylistsWithDevices = PlaylistsModule.forRootAsync({
  imports: [DevicesWithBrandConfig, TenantsModule],
  devices: {
    inject: [FindDeviceUseCase, ChangePlaylistCountUseCase],
    useFactory: (
      findDevice: FindDeviceUseCase,
      changeCount: ChangePlaylistCountUseCase,
    ): PlaylistDevices => ({
      findIdByMac: async (mac) => {
        const found = await findDevice.execute(mac);
        return found.ok ? found.value.device.id : null;
      },
      playlistCountChanged: (deviceId, delta) => changeCount.execute({ deviceId, delta }),
    }),
  },
  pinKey: {
    inject: [GetTenantSecretUseCase, TenantContext],
    useFactory: (getSecret: GetTenantSecretUseCase, context: TenantContext): PlaylistPinKey => ({
      current: () => getSecret.execute(context.current.id, PLAYLIST_PIN_KEY_SECRET),
    }),
  },
  brand: {
    inject: [GetTenantConfigUseCase, TenantContext],
    useFactory: (getConfig: GetTenantConfigUseCase, context: TenantContext): PlaylistBrand => ({
      replyProfile: () => Promise.resolve(context.current.settings.playlistProfile),
      rawForAndroid44: () =>
        Promise.resolve(context.current.settings.features.rawPlaylistsForAndroid44),
      demoUrl: async () => (await getConfig.execute(context.current)).app.demoUrl,
    }),
  },
  macOnlyRateLimit: {
    inject: [RedisRateLimiter, TenantContext],
    useFactory: (limiter: RedisRateLimiter, context: TenantContext): MacOnlyRateLimit => ({
      take: (ip) => limiter.take(`playlists:mac-only:${context.current.id}:${ip}`, MAC_ONLY_LIMIT),
    }),
  },
});

/** Licensing finds devices, moves a trial device to devices on payment, and locks per device. */
export const LicensingWithDevices = LicensingModule.forRootAsync({
  imports: [DevicesWithBrandConfig],
  devices: {
    inject: [FindDeviceByIdUseCase, ApplyLicenseUseCase],
    useFactory: (
      findDevice: FindDeviceByIdUseCase,
      applyLicense: ApplyLicenseUseCase,
    ): LicensedDevices => ({
      find: async (deviceId) => {
        const found = await findDevice.execute(deviceId);
        if (!found.ok) return null;
        const { paid, device } = found.value;
        return paid
          ? { id: device.id, paid, trialEndsAt: null, currentLicenseId: device.currentLicenseId }
          : { id: device.id, paid, trialEndsAt: device.trialEndsAt, currentLicenseId: null };
      },
      markPaid: async (deviceId, paidBy) => {
        const applied = await applyLicense.execute({ deviceId, ...paidBy });
        if (applied.ok) return 'done';
        return applied.error.code === 'devices.not_found' ? 'not_found' : 'conflict';
      },
    }),
  },
  lock: {
    inject: [RedisLock, TenantContext],
    useFactory: (lock: RedisLock, context: TenantContext): LicenseLock => ({
      withDevice: (deviceId, fn) =>
        lock.withLock(`licensing:device:${context.current.id}:${deviceId}`, LICENSE_LOCK, fn),
    }),
  },
});
