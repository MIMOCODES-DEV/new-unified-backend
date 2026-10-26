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
import { SeedLicenseExamples } from './application/seed-license-examples.js';
import { ActivateLicenseUseCase } from './application/use-cases/activate-license.use-case.js';
import { MongoLicenseRepository } from './infrastructure/mongo-license.repository.js';

const useCases = [ActivateLicenseUseCase];

export interface LicensingModuleOptions {
  /** Modules the factories need. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** How licensing reaches the devices module (bound by the process root: src/module-settings.ts). */
  devices: Omit<FactoryProvider<LicensedDevices>, 'provide'>;
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
        { provide: LicensedDevices, ...options.devices },
        { provide: LicenseLock, ...options.lock },
      ],
      exports: [...useCases, SeedLicenseExamples],
    };
  }
}
