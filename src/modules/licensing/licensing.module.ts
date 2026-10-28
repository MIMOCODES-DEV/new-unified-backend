import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { LicenseLock } from './application/ports/license-lock.js';
import { LicenseRepository } from './application/ports/license.repository.js';
import { LicensedDevices } from './application/ports/licensed-devices.js';
import { LicensedPlaylists } from './application/ports/licensed-playlists.js';
import { SeedLicenseExamples } from './application/seed-license-examples.js';
import { ActivateLicenseUseCase } from './application/use-cases/activate-license.use-case.js';
import { DeviceLicenseUseCase } from './application/use-cases/device-license.use-case.js';
import { LicenseHistoryUseCase } from './application/use-cases/license-history.use-case.js';
import { RevokeLicenseUseCase } from './application/use-cases/revoke-license.use-case.js';
import { SwitchMacUseCase } from './application/use-cases/switch-mac.use-case.js';
import { RecoveryCodeGenerator } from './application/ports/recovery-code-generator.js';
import { CreateRecoveryCodeUseCase } from './application/use-cases/create-recovery-code.use-case.js';
import { RecoverWithCodeUseCase } from './application/use-cases/recover-with-code.use-case.js';
import { CleanUpTrialDevicesUseCase } from './application/use-cases/clean-up-trial-devices.use-case.js';
import { RandomRecoveryCodeGenerator } from './infrastructure/random-recovery-code.generator.js';
import { MongoLicenseRepository } from './infrastructure/mongo-license.repository.js';

const useCases = [
  ActivateLicenseUseCase,
  RevokeLicenseUseCase,
  DeviceLicenseUseCase,
  LicenseHistoryUseCase,
  SwitchMacUseCase,
  CreateRecoveryCodeUseCase,
  RecoverWithCodeUseCase,
  CleanUpTrialDevicesUseCase,
];

export interface LicensingModuleOptions {
  /** Modules the factories need. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** How licensing reaches the devices module (bound by the process root: src/module-settings.ts). */
  devices: Omit<FactoryProvider<LicensedDevices>, 'provide'>;
  /** How a MAC switch moves, and a recovery or the cleanup removes, playlists (src/module-settings.ts). */
  playlists: Omit<FactoryProvider<LicensedPlaylists>, 'provide'>;
  /** One activation of a device at a time, across servers. */
  lock: Omit<FactoryProvider<LicenseLock>, 'provide'>;
}

/** Licensing: the licenses of each brand. Needs DatabaseModule and TenancyModule (both global). */
@Module({})
export class LicensingModule {
  static forRootAsync(options: LicensingModuleOptions): DynamicModule {
    return {
      module: LicensingModule,
      imports: options.imports,
      providers: [
        ...useCases,
        SeedLicenseExamples,
        { provide: Clock, useClass: SystemClock },
        { provide: LicenseRepository, useClass: MongoLicenseRepository },
        { provide: RecoveryCodeGenerator, useClass: RandomRecoveryCodeGenerator },
        { provide: LicensedDevices, ...options.devices },
        { provide: LicensedPlaylists, ...options.playlists },
        { provide: LicenseLock, ...options.lock },
      ],
      exports: [...useCases, SeedLicenseExamples],
    };
  }
}
