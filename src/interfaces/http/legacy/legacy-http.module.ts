import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { V4DeviceController } from './v4-device.controller.js';

/** The old apps' routes: same paths and wire formats as the old backends. */
@Module({
  imports: [DevicesModule],
  controllers: [V4DeviceController],
})
export class LegacyHttpModule {}
