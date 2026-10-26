// Public API of the licensing module: the only file other modules and interfaces may import.
export { SeedLicenseExamples } from './application/seed-license-examples.js';
export { LicensingModule, type LicensingModuleOptions } from './licensing.module.js';
export {
  LicensedDevices,
  type LicensedDevice,
  type PaidBy,
} from './application/ports/licensed-devices.js';
export { LicenseLock } from './application/ports/license-lock.js';
export {
  ActivateLicenseUseCase,
  type ActivateLicenseInput,
} from './application/use-cases/activate-license.use-case.js';
export { licensingMigrations } from './infrastructure/licensing.migrations.js';
