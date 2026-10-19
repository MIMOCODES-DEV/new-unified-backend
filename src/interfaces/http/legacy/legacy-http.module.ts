import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { TvV4Controller } from './tv-v4.controller.js';

/** The old apps' routes: same paths and wire formats as the old backends. */
@Module({
  imports: [DevicesModule],
  controllers: [TvV4Controller],
})
export class LegacyHttpModule {}
