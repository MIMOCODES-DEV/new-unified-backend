import { type DeviceSettings, DevicesModule } from './modules/devices/index.js';
import { GetTenantConfigUseCase, TenantsModule } from './modules/tenants/index.js';
import { TenantContext } from './shared/tenancy/tenant-context.js';

/**
 * Feature modules wired to the brand config. A module may not import another module, so the
 * settings each one reads from `tenantConfig` are bound here, once for every process.
 */
export const DevicesWithBrandConfig = DevicesModule.forRootAsync({
  imports: [TenantsModule],
  settings: {
    inject: [GetTenantConfigUseCase, TenantContext],
    useFactory: (getConfig: GetTenantConfigUseCase, context: TenantContext): DeviceSettings => ({
      trialDays: async () => (await getConfig.execute(context.current)).trial.days,
    }),
  },
});
