import {
  ChangePlaylistCountUseCase,
  type DeviceSettings,
  DevicesModule,
  FindDeviceUseCase,
} from './modules/devices/index.js';
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
import { RedisRateLimiter } from './shared/redis/redis-rate-limiter.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

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
