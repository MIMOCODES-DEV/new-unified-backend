import { Module } from '@nestjs/common';
import { DevicesModule } from '../../../modules/devices/index.js';
import { V4DeviceController } from './v4-device.controller.js';

/** The old apps' V4 device API (recaptcha, device_login, device_info). */
@Module({
  imports: [DevicesModule],
  controllers: [V4DeviceController],
})
export class LegacyV4Module {}
