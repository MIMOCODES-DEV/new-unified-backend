import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { CaptchaImages, CaptchaStore } from './application/ports/captcha.js';
import { DeviceKeyGenerator } from './application/ports/device-key.generator.js';
import { DeviceSettings } from './application/ports/device-settings.js';
import { DeviceRepository } from './application/ports/device.repository.js';
import { RandomMacGenerator } from './application/ports/random-mac.generator.js';
import { ActivateDeviceUseCase } from './application/use-cases/activate-device.use-case.js';
import { GetV4DeviceInfoUseCase } from './application/use-cases/get-v4-device-info.use-case.js';
import { LoginAppDeviceUseCase } from './application/use-cases/login-app-device.use-case.js';
import { LoginV4DeviceUseCase } from './application/use-cases/login-v4-device.use-case.js';
import { RegisterOrGetDeviceUseCase } from './application/use-cases/register-or-get-device.use-case.js';
import { RequestRegistrationCaptchaUseCase } from './application/use-cases/request-registration-captcha.use-case.js';
import { SetTrialDaysUseCase } from './application/use-cases/set-trial-days.use-case.js';
import { MongoCaptchaStore } from './infrastructure/mongo-captcha.store.js';
import { MongoDeviceSettings } from './infrastructure/mongo-device-settings.js';
import { MongoDeviceRepository } from './infrastructure/mongo-device.repository.js';
import { RandomDeviceKeyGenerator } from './infrastructure/random-device-key.generator.js';
import { CryptoRandomMacGenerator } from './infrastructure/random-mac.generator.js';
import { SvgCaptchaImages } from './infrastructure/svg-captcha.images.js';

@Module({
  providers: [
    RegisterOrGetDeviceUseCase,
    ActivateDeviceUseCase,
    SetTrialDaysUseCase,
    RequestRegistrationCaptchaUseCase,
    LoginV4DeviceUseCase,
    GetV4DeviceInfoUseCase,
    LoginAppDeviceUseCase,
    { provide: CaptchaStore, useClass: MongoCaptchaStore },
    { provide: CaptchaImages, useClass: SvgCaptchaImages },
    { provide: DeviceSettings, useClass: MongoDeviceSettings },
    { provide: DeviceRepository, useClass: MongoDeviceRepository },
    { provide: DeviceKeyGenerator, useClass: RandomDeviceKeyGenerator },
    { provide: RandomMacGenerator, useClass: CryptoRandomMacGenerator },
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [
    RegisterOrGetDeviceUseCase,
    ActivateDeviceUseCase,
    SetTrialDaysUseCase,
    DeviceSettings,
    RequestRegistrationCaptchaUseCase,
    LoginV4DeviceUseCase,
    GetV4DeviceInfoUseCase,
    LoginAppDeviceUseCase,
  ],
})
export class DevicesModule {}
