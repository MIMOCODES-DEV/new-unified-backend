import { Module } from '@nestjs/common';
import {
  DevicesWithBrandConfig,
  LicensingWithDevices,
  PlaylistsWithDevices,
} from '../../../module-settings.js';
import { TenantsModule } from '../../../modules/tenants/index.js';
import { Clock, SystemClock } from '../../../shared/kernel/clock.js';
import { StoreKey } from './store-key.js';
import { StoreController } from './store.controller.js';

/** The store's routes (the store panel where resellers sell): same contract as the old backends. */
@Module({
  imports: [DevicesWithBrandConfig, PlaylistsWithDevices, LicensingWithDevices, TenantsModule],
  controllers: [StoreController],
  providers: [StoreKey, { provide: Clock, useClass: SystemClock }],
})
export class StoreHttpModule {}
