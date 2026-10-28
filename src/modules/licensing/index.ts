// Public API of the licensing module: the only file other modules and interfaces may import.
export { SeedLicenseExamples } from './application/seed-license-examples.js';
export { LicensingModule } from './licensing.module.js';
export {
  LicensedDevices,
  type MacSwitchOutcome,
  type RecoveryOutcome,
} from './application/ports/licensed-devices.js';
export { LicensedPlaylists } from './application/ports/licensed-playlists.js';
export { SwitchMacUseCase } from './application/use-cases/switch-mac.use-case.js';
export { LicenseLock } from './application/ports/license-lock.js';
export { CreateRecoveryCodeUseCase } from './application/use-cases/create-recovery-code.use-case.js';
export { RecoverWithCodeUseCase } from './application/use-cases/recover-with-code.use-case.js';
export { CleanUpTrialDevicesUseCase } from './application/use-cases/clean-up-trial-devices.use-case.js';
export { RevokeLicenseUseCase } from './application/use-cases/revoke-license.use-case.js';
export {
  DeviceLicenseUseCase,
  type DeviceLicenseOutput,
} from './application/use-cases/device-license.use-case.js';
export { LicenseHistoryUseCase } from './application/use-cases/license-history.use-case.js';
export { ACTIVATION_SOURCES, LICENSE_TYPES } from './domain/license.js';
export { ActivateLicenseUseCase } from './application/use-cases/activate-license.use-case.js';
export { licensingMigrations } from './infrastructure/licensing.migrations.js';
