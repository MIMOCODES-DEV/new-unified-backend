import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { DeviceIdentity } from './application/device-identity.js';
import { CaptchaRepository } from './application/ports/captcha.repository.js';
import { DeviceLock } from './application/ports/device-lock.js';
import { PaidDeviceRepository } from './application/ports/paid-device.repository.js';
import { TrialDeviceRepository } from './application/ports/trial-device.repository.js';
import { SeedDeviceExamples } from './application/seed-device-examples.js';
import { MongoCaptchaRepository } from './infrastructure/mongo-captcha.repository.js';
import { MongoPaidDeviceRepository } from './infrastructure/mongo-paid-device.repository.js';
import { MongoTrialDeviceRepository } from './infrastructure/mongo-trial-device.repository.js';
import { RedisDeviceLock } from './infrastructure/redis-device-lock.js';

/**
 * Devices: trialDevices, devices and captchas of each brand. DeviceIdentity is the only way to
 * create a device, move it to devices or change its MAC (one MAC, one device).
 * Needs DatabaseModule, TenancyModule and RedisModule (all global).
 */
@Module({
  providers: [
    DeviceIdentity,
    SeedDeviceExamples,
    { provide: Clock, useClass: SystemClock },
    { provide: TrialDeviceRepository, useClass: MongoTrialDeviceRepository },
    { provide: PaidDeviceRepository, useClass: MongoPaidDeviceRepository },
    { provide: CaptchaRepository, useClass: MongoCaptchaRepository },
    { provide: DeviceLock, useClass: RedisDeviceLock },
  ],
  exports: [DeviceIdentity, SeedDeviceExamples],
})
export class DevicesModule {}
