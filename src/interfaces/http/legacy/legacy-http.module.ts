import { Module } from '@nestjs/common';
import {
  DevicesWithBrandConfig,
  LicensingWithDevices,
  PlaylistsWithDevices,
} from '../../../module-settings.js';
import { TenantsModule } from '../../../modules/tenants/index.js';
import { Clock, SystemClock } from '../../../shared/kernel/clock.js';
import { LegacyDeviceController } from './legacy-device.controller.js';
import { LegacyPlaylistsController } from './legacy-playlists.controller.js';
import { StarArcsGuests } from './stararcs-guests.js';
import { V4Controller } from './v4.controller.js';

/** The old apps' routes: same paths and wire formats as the old backends. */
@Module({
  imports: [DevicesWithBrandConfig, PlaylistsWithDevices, LicensingWithDevices, TenantsModule],
  controllers: [V4Controller, LegacyPlaylistsController, LegacyDeviceController],
  providers: [StarArcsGuests, { provide: Clock, useClass: SystemClock }],
})
export class LegacyHttpModule {}
