// Public API of the devices module: the only file other modules and interfaces may import.
// Use cases and types are exported here as the Devices feature adds callers for them.
export { DevicesModule } from './devices.module.js';
export { DeviceSettings } from './application/ports/device-settings.js';
export { API_VERSIONS, PLATFORMS, type Platform } from './domain/device.js';
export { RegisterDeviceUseCase } from './application/use-cases/register-device.use-case.js';
export { FindDeviceUseCase } from './application/use-cases/find-device.use-case.js';
export { FindDeviceByIdUseCase } from './application/use-cases/find-device-by-id.use-case.js';
export { ApplyLicenseUseCase } from './application/use-cases/apply-license.use-case.js';
export { FindDeviceByTokenIdUseCase } from './application/use-cases/find-device-by-token-id.use-case.js';
export { HasSolvedCaptchaUseCase } from './application/use-cases/has-solved-captcha.use-case.js';
export { ChangePlaylistCountUseCase } from './application/use-cases/change-playlist-count.use-case.js';
export { IssueCaptchaUseCase } from './application/use-cases/issue-captcha.use-case.js';
export { IssueUidRecoveryCaptchaUseCase } from './application/use-cases/issue-uid-recovery-captcha.use-case.js';
export { LoginV4DeviceUseCase } from './application/use-cases/login-v4-device.use-case.js';
export { CheckCaptchaCodeUseCase } from './application/use-cases/check-captcha-code.use-case.js';
export { VerifyDeviceKeyUseCase } from './application/use-cases/verify-device-key.use-case.js';
export { ChangeDeviceKeyUseCase } from './application/use-cases/change-device-key.use-case.js';
export { SetParentPinUseCase } from './application/use-cases/set-parent-pin.use-case.js';
export { SeedDeviceExamples } from './application/seed-device-examples.js';
export { devicesMigrations } from './infrastructure/devices.migrations.js';
