import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { DeviceIdentity } from './application/device-identity.js';
import { CaptchaRepository } from './application/ports/captcha.repository.js';
import { DeviceKeyGenerator } from './application/ports/device-key-generator.js';
import { DeviceLock } from './application/ports/device-lock.js';
import { DeviceSettings } from './application/ports/device-settings.js';
import { PaidDeviceRepository } from './application/ports/paid-device.repository.js';
import { TrialDeviceRepository } from './application/ports/trial-device.repository.js';
import { SeedDeviceExamples } from './application/seed-device-examples.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { MongoCaptchaRepository } from './infrastructure/mongo-captcha.repository.js';
import { MongoPaidDeviceRepository } from './infrastructure/mongo-paid-device.repository.js';
import { MongoTrialDeviceRepository } from './infrastructure/mongo-trial-device.repository.js';
import { RandomDeviceKeyGenerator } from './infrastructure/random-device-key.generator.js';
import { RedisDeviceLock } from './infrastructure/redis-device-lock.js';

const providers = [
  DeviceIdentity,
  RegisterDeviceUseCase,
  SeedDeviceExamples,
  { provide: Clock, useClass: SystemClock },
  { provide: TrialDeviceRepository, useClass: MongoTrialDeviceRepository },
  { provide: PaidDeviceRepository, useClass: MongoPaidDeviceRepository },
  { provide: CaptchaRepository, useClass: MongoCaptchaRepository },
  { provide: DeviceLock, useClass: RedisDeviceLock },
  { provide: DeviceKeyGenerator, useClass: RandomDeviceKeyGenerator },
];

export interface DevicesModuleOptions {
  /** Modules the settings factory needs. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** How device rules read brand config (bound by the process root: src/module-settings.ts). */
  settings: Omit<FactoryProvider<DeviceSettings>, 'provide'>;
}

/**
 * Devices: trialDevices, devices and captchas of each brand. DeviceIdentity is the only way to
 * create a device, move it to devices or change its MAC (one MAC, one device).
 * Needs DatabaseModule, TenancyModule and RedisModule (all global).
 */
@Module({})
export class DevicesModule {
  static forRootAsync(options: DevicesModuleOptions): DynamicModule {
    return {
      module: DevicesModule,
      imports: options.imports,
      providers: [...providers, { provide: DeviceSettings, ...options.settings }],
      exports: [DeviceIdentity, RegisterDeviceUseCase, SeedDeviceExamples],
    };
  }
}
