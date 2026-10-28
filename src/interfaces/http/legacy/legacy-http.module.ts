import { Module } from '@nestjs/common';
import {
  DevicesWithBrandConfig,
  LicensingWithDevices,
  PlaylistsWithDevices,
} from '../../../module-settings.js';
import { TenantsModule } from '../../../modules/tenants/index.js';
import { Clock, SystemClock } from '../../../shared/kernel/clock.js';
import { LegacyDeviceController } from './legacy-device.controller.js';
import { LegacyDevices } from './legacy-devices.js';
import { LegacyPlaylistSyncController } from './legacy-playlist-sync.controller.js';
import { LegacyPlaylistsController } from './legacy-playlists.controller.js';
import { LegacyRokuController } from './legacy-roku.controller.js';
import { LegacyTvController } from './legacy-tv.controller.js';
import { StarArcsGuests } from './stararcs-guests.js';
import { V4Controller } from './v4.controller.js';

/** The old apps' routes: same paths and wire formats as the old backends. */
@Module({
  imports: [DevicesWithBrandConfig, PlaylistsWithDevices, LicensingWithDevices, TenantsModule],
  controllers: [
    V4Controller,
    LegacyPlaylistsController,
    LegacyDeviceController,
    LegacyTvController,
    LegacyRokuController,
    LegacyPlaylistSyncController,
  ],
  providers: [StarArcsGuests, LegacyDevices, { provide: Clock, useClass: SystemClock }],
})
export class LegacyHttpModule {}
