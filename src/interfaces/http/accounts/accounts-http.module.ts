import { Injectable, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common';
import {
  CustomersWithDevices,
  DevicesWithBrandConfig,
  LicensingWithDevices,
} from '../../../module-settings.js';
import { StaffModule, SyncPermissionsUseCase } from '../../../modules/staff/index.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { StaffAccess } from '../../../shared/auth/staff-access.js';
import { ContactModule } from '../../../modules/contact/index.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminContactController } from './admin-contact.controller.js';
import { AdminDevicesController } from './admin-devices.controller.js';
import { AdminStaffController } from './admin-staff.controller.js';
import { CustomerController } from './customer.controller.js';
import { declaredPermissions } from './permission-keys.js';
import { StaffAccessAdapter } from './staff-access.adapter.js';

/** Every controller with staff routes: their permission keys are the `permissions` collection. */
export const ADMIN_CONTROLLERS = [
  AdminAuthController,
  AdminStaffController,
  AdminDevicesController,
  AdminContactController,
];

/** PRM-1: on every API start, the keys in the code become the permissions. */
@Injectable()
class SyncPermissionsOnStartup implements OnApplicationBootstrap {
  private readonly logger = new Logger('Permissions');

  constructor(private readonly sync: SyncPermissionsUseCase) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const report = await this.sync.execute(declaredPermissions(ADMIN_CONTROLLERS));
      this.logger.log(`Permission keys synced: ${JSON.stringify(report)}`);
    } catch (error) {
      // The last sync stays in force; a failed one must not stop the API serving the apps.
      this.logger.error(`Permission sync failed: ${(error as Error).message}`);
    }
  }
}

/** Customer accounts (brand sites) and the staff side of the admin panel (Phase 5). */
@Module({
  imports: [
    StaffModule,
    CustomersWithDevices,
    DevicesWithBrandConfig,
    LicensingWithDevices,
    ContactModule,
  ],
  controllers: [CustomerController, ...ADMIN_CONTROLLERS],
  providers: [
    AuthContext,
    SyncPermissionsOnStartup,
    { provide: StaffAccess, useClass: StaffAccessAdapter },
  ],
  // The global AccessGuard (ApiModule) checks staff sessions with these.
  exports: [AuthContext, StaffAccess],
})
export class AccountsHttpModule {}
