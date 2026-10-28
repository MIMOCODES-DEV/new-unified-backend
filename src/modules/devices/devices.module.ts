import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { Captchas } from './application/captchas.js';
import { DeviceIdentity } from './application/device-identity.js';
import { CaptchaImage } from './application/ports/captcha-image.js';
import { CaptchaRepository } from './application/ports/captcha.repository.js';
import { DeviceKeyGenerator } from './application/ports/device-key-generator.js';
import { DeviceLock } from './application/ports/device-lock.js';
import { DeviceSettings } from './application/ports/device-settings.js';
import { PaidDeviceRepository } from './application/ports/paid-device.repository.js';
import { TrialDeviceRepository } from './application/ports/trial-device.repository.js';
import { SeedDeviceExamples } from './application/seed-device-examples.js';
import { CheckCaptchaCodeUseCase } from './application/use-cases/check-captcha-code.use-case.js';
import { IssueCaptchaUseCase } from './application/use-cases/issue-captcha.use-case.js';
import { IssueUidRecoveryCaptchaUseCase } from './application/use-cases/issue-uid-recovery-captcha.use-case.js';
import { LoginV4DeviceUseCase } from './application/use-cases/login-v4-device.use-case.js';
import { FindDeviceUseCase } from './application/use-cases/find-device.use-case.js';
import { ApplyLicenseUseCase } from './application/use-cases/apply-license.use-case.js';
import { FindDeviceByIdUseCase } from './application/use-cases/find-device-by-id.use-case.js';
import { FindDeviceByTokenIdUseCase } from './application/use-cases/find-device-by-token-id.use-case.js';
import { HasSolvedCaptchaUseCase } from './application/use-cases/has-solved-captcha.use-case.js';
import { ChangePlaylistCountUseCase } from './application/use-cases/change-playlist-count.use-case.js';
import { ChangeDeviceKeyUseCase } from './application/use-cases/change-device-key.use-case.js';
import { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
import { SetParentPinUseCase } from './application/use-cases/set-parent-pin.use-case.js';
import { BindAppUidUseCase } from './application/use-cases/bind-app-uid.use-case.js';
import { AnswerAppCaptchaUseCase } from './application/use-cases/answer-app-captcha.use-case.js';
import { SwitchDeviceMacUseCase } from './application/use-cases/switch-device-mac.use-case.js';
import { VerifyDeviceKeyUseCase } from './application/use-cases/verify-device-key.use-case.js';
import { SetRecoveryCodeUseCase } from './application/use-cases/set-recovery-code.use-case.js';
import { FindDeviceByRecoveryCodeUseCase } from './application/use-cases/find-device-by-recovery-code.use-case.js';
import { RecoverDeviceUseCase } from './application/use-cases/recover-device.use-case.js';
import { ListStaleTrialDevicesUseCase } from './application/use-cases/list-stale-trial-devices.use-case.js';
import { DeleteStaleTrialDeviceUseCase } from './application/use-cases/delete-stale-trial-device.use-case.js';
import { MongoCaptchaRepository } from './infrastructure/mongo-captcha.repository.js';
import { MongoPaidDeviceRepository } from './infrastructure/mongo-paid-device.repository.js';
import { MongoTrialDeviceRepository } from './infrastructure/mongo-trial-device.repository.js';
import { RandomDeviceKeyGenerator } from './infrastructure/random-device-key.generator.js';
import { RedisDeviceLock } from './infrastructure/redis-device-lock.js';
import { SvgCaptchaImage } from './infrastructure/svg-captcha.image.js';

import {
  LinkDeviceToCustomerUseCase,
  ListCustomerDevicesUseCase,
  UnlinkDeviceFromCustomerUseCase,
} from './application/use-cases/customer-devices.use-cases.js';

import { AnswerWebCaptchaUseCase } from './application/use-cases/answer-web-captcha.use-case.js';
import { SetDeviceUidUseCase } from './application/use-cases/set-device-uid.use-case.js';

const useCases = [
  AnswerWebCaptchaUseCase,
  SetDeviceUidUseCase,
  LinkDeviceToCustomerUseCase,
  UnlinkDeviceFromCustomerUseCase,
  ListCustomerDevicesUseCase,
  RegisterDeviceUseCase,
  FindDeviceUseCase,
  ChangePlaylistCountUseCase,
  FindDeviceByIdUseCase,
  ApplyLicenseUseCase,
  HasSolvedCaptchaUseCase,
  FindDeviceByTokenIdUseCase,
  ChangeDeviceKeyUseCase,
  VerifyDeviceKeyUseCase,
  SetParentPinUseCase,
  BindAppUidUseCase,
  AnswerAppCaptchaUseCase,
  IssueCaptchaUseCase,
  IssueUidRecoveryCaptchaUseCase,
  CheckCaptchaCodeUseCase,
  LoginV4DeviceUseCase,
  SwitchDeviceMacUseCase,
  SetRecoveryCodeUseCase,
  FindDeviceByRecoveryCodeUseCase,
  RecoverDeviceUseCase,
  ListStaleTrialDevicesUseCase,
  DeleteStaleTrialDeviceUseCase,
];

const providers = [
  DeviceIdentity,
  Captchas,
  ...useCases,
  SeedDeviceExamples,
  { provide: Clock, useClass: SystemClock },
  { provide: TrialDeviceRepository, useClass: MongoTrialDeviceRepository },
  { provide: PaidDeviceRepository, useClass: MongoPaidDeviceRepository },
  { provide: CaptchaRepository, useClass: MongoCaptchaRepository },
  { provide: DeviceLock, useClass: RedisDeviceLock },
  { provide: DeviceKeyGenerator, useClass: RandomDeviceKeyGenerator },
  { provide: CaptchaImage, useClass: SvgCaptchaImage },
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
      exports: [DeviceIdentity, ...useCases, SeedDeviceExamples],
    };
  }
}
