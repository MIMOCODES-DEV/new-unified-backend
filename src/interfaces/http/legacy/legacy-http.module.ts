import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { SignedV2Controller } from './signed-v2.controller.js';
import { TvV1Controller } from './tv-v1.controller.js';
import { TvV3Controller } from './tv-v3.controller.js';
import { V4DeviceController } from './v4-device.controller.js';

/** The old apps' routes: same paths and wire formats as the old backends. */
@Module({
  imports: [DevicesModule],
  controllers: [TvV1Controller, SignedV2Controller, TvV3Controller, V4DeviceController],
})
export class LegacyHttpModule {}
