import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { DomainMigrationRepository } from './application/ports/domain-migration.repository.js';
import { SeedDomainMigrationExamples } from './application/seed-domain-migration-examples.js';
import { MongoDomainMigrationRepository } from './infrastructure/mongo-domain-migration.repository.js';

/**
 * Provider domain moves, central for every brand. Its use cases (learn, approve, serve) come with
 * the Provider domain moves feature. Needs DatabaseModule (global).
 */
@Module({
  providers: [
    SeedDomainMigrationExamples,
    { provide: Clock, useClass: SystemClock },
    { provide: DomainMigrationRepository, useClass: MongoDomainMigrationRepository },
  ],
  exports: [SeedDomainMigrationExamples],
})
export class DomainMigrationsModule {}
