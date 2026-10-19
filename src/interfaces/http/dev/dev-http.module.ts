import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { DevDevicesController } from './dev-devices.controller.js';

/** Development-only routes under /dev. Never imported in production. */
@Module({
  imports: [DevicesModule],
  controllers: [DevDevicesController],
})
export class DevHttpModule {}
