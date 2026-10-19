import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { TvV3Controller } from './tv-v3.controller.js';
import { V4DeviceController } from './v4-device.controller.js';

/** The old apps' routes: same paths and wire formats as the old backends. */
@Module({
  imports: [DevicesModule],
  controllers: [TvV3Controller, V4DeviceController],
})
export class LegacyHttpModule {}
