import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { LicenseRepository } from './application/ports/license.repository.js';
import { SeedLicenseExamples } from './application/seed-license-examples.js';
import { MongoLicenseRepository } from './infrastructure/mongo-license.repository.js';

/**
 * Licensing: the licenses of each brand. Its use cases (activate, revoke, history) come with the
 * Licensing feature. Needs DatabaseModule and TenancyModule (both global).
 */
@Module({
  providers: [
    SeedLicenseExamples,
    { provide: Clock, useClass: SystemClock },
    { provide: LicenseRepository, useClass: MongoLicenseRepository },
  ],
  exports: [SeedLicenseExamples],
})
export class LicensingModule {}
