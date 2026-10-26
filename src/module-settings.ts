import {
  ChangePlaylistCountUseCase,
  type DeviceSettings,
  DevicesModule,
  FindDeviceUseCase,
} from './modules/devices/index.js';
import { type PlaylistDevices, PlaylistsModule } from './modules/playlists/index.js';
import { GetTenantConfigUseCase, TenantsModule } from './modules/tenants/index.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

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

/** Playlists find devices by MAC and keep the trial devices' playlist counters in step. */
export const PlaylistsWithDevices = PlaylistsModule.forRootAsync({
  imports: [DevicesWithBrandConfig],
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
});
