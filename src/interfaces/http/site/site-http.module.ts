import { Module } from '@nestjs/common';
import {
  DevicesWithBrandConfig,
  LicensingWithDevices,
  PlaylistsWithDevices,
} from '../../../module-settings.js';
import { AuthContext } from '../../../shared/auth/auth-context.js';
import { DeviceSessionController } from './device-session.controller.js';
import { SiteController } from './site.controller.js';

/**
 * The brand site's device API (Phase 6): a TV's dashboard after logging in with its MAC and device
 * key, and the public tools. Replaces the old `/frontend/device/*` routes (D15).
 */
@Module({
  imports: [DevicesWithBrandConfig, LicensingWithDevices, PlaylistsWithDevices],
  controllers: [DeviceSessionController, SiteController],
  providers: [AuthContext],
})
export class SiteHttpModule {}
