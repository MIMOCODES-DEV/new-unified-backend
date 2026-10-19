import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { CaptchaImageGenerator, CaptchaRepository } from './application/ports/captcha.ports.js';
import { DeviceKeyGenerator } from './application/ports/device-key-generator.js';
import { DeviceSettings } from './application/ports/device-settings.js';
import { DeviceRepository } from './application/ports/device.repository.js';
import {
  IsCaptchaVerifiedUseCase,
  IssueCaptchaUseCase,
  VerifyCaptchaUseCase,
} from './application/use-cases/device-captcha.use-cases.js';
import { GetDeviceUseCase } from './application/use-cases/get-device.use-case.js';
import { LoginV4DeviceUseCase } from './application/use-cases/login-v4-device.use-case.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { DefaultDeviceSettings } from './infrastructure/default-device.settings.js';
import { MongoCaptchaRepository } from './infrastructure/mongo-captcha.repository.js';
import { MongoDeviceRepository } from './infrastructure/mongo-device.repository.js';
import { RandomDeviceKeyGenerator } from './infrastructure/random-device-key.generator.js';
import { SvgCaptchaGenerator } from './infrastructure/svg-captcha.generator.js';

/** Binds each port to its real adapter and exports the use cases. */
@Module({
  providers: [
    RegisterDeviceUseCase,
    IssueCaptchaUseCase,
    VerifyCaptchaUseCase,
    IsCaptchaVerifiedUseCase,
    LoginV4DeviceUseCase,
    GetDeviceUseCase,
    { provide: CaptchaRepository, useClass: MongoCaptchaRepository },
    { provide: CaptchaImageGenerator, useClass: SvgCaptchaGenerator },
    { provide: DeviceRepository, useClass: MongoDeviceRepository },
    { provide: DeviceSettings, useClass: DefaultDeviceSettings },
    { provide: DeviceKeyGenerator, useClass: RandomDeviceKeyGenerator },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [
    RegisterDeviceUseCase,
    IssueCaptchaUseCase,
    IsCaptchaVerifiedUseCase,
    LoginV4DeviceUseCase,
    GetDeviceUseCase,
  ],
})
export class DevicesModule {}
