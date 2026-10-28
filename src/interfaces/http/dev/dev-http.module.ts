import { Module } from '@nestjs/common';
import {
  DevicesWithBrandConfig,
  DomainMigrationsWithDevices,
  LicensingWithDevices,
  PlaylistsWithDevices,
} from '../../../module-settings.js';
import { StaffModule } from '../../../modules/staff/index.js';
import { TenantsModule } from '../../../modules/tenants/index.js';
import { DevDatabaseController } from './dev-database.controller.js';
import { DevDevicesController } from './dev-devices.controller.js';
import { DevDomainMovesController } from './dev-domain-moves.controller.js';
import { DevLicensesController } from './dev-licenses.controller.js';
import { DevOnlyGuard } from './dev-only.guard.js';
import { DevAccountsController } from './dev-accounts.controller.js';
import { DevPlaygroundController } from './dev-playground.controller.js';
import { DevPlaylistsController } from './dev-playlists.controller.js';

/**
 * Dev-only routes and the device playground (`/dev/playground`), to try the rules against a real
 * database before the app routes exist. Every route answers 404 in production.
 */
@Module({
  imports: [
    DevicesWithBrandConfig,
    PlaylistsWithDevices,
    LicensingWithDevices,
    DomainMigrationsWithDevices,
    TenantsModule,
    StaffModule,
  ],
  controllers: [
    DevDevicesController,
    DevPlaylistsController,
    DevLicensesController,
    DevDomainMovesController,
    DevPlaygroundController,
    DevDatabaseController,
    DevAccountsController,
  ],
  providers: [DevOnlyGuard],
})
export class DevHttpModule {}
