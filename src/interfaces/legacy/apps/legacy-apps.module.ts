import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { LegacyAppsController } from './legacy-apps.controller.js';

/** Registration routes of the old apps before V4 (legacy TV, signed Android, Roku, iOS/Android). */
@Module({
  imports: [DevicesModule],
  controllers: [LegacyAppsController],
})
export class LegacyAppsModule {}
