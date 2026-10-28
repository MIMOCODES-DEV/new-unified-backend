import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { ApprovedMovesCache } from './application/approved-moves-cache.js';
import { DomainMigrationRepository } from './application/ports/domain-migration.repository.js';
import { MoveDevices } from './application/ports/move-devices.js';
import { SeedDomainMigrationExamples } from './application/seed-domain-migration-examples.js';
import { ApprovedHostMovesUseCase } from './application/use-cases/approved-host-moves.use-case.js';
import { DecideHostMoveUseCase } from './application/use-cases/decide-host-move.use-case.js';
import { ListHostMovesUseCase } from './application/use-cases/list-host-moves.use-case.js';
import { ReportHostMoveUseCase } from './application/use-cases/report-host-move.use-case.js';
import { MongoDomainMigrationRepository } from './infrastructure/mongo-domain-migration.repository.js';

const useCases = [
  ReportHostMoveUseCase,
  ListHostMovesUseCase,
  DecideHostMoveUseCase,
  ApprovedHostMovesUseCase,
];

export interface DomainMigrationsModuleOptions {
  /** Modules the factory needs. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** How a report checks the device paid (bound by the process root: src/module-settings.ts). */
  devices: Omit<FactoryProvider<MoveDevices>, 'provide'>;
}

/**
 * Provider domain moves, central for every brand: learned from paid devices (DOM-1), approved or
 * blocked by staff, and served in playlist replies once approved (DOM-2). Needs DatabaseModule
 * (global).
 */
@Module({})
export class DomainMigrationsModule {
  static forRootAsync(options: DomainMigrationsModuleOptions): DynamicModule {
    return {
      module: DomainMigrationsModule,
      imports: options.imports,
      providers: [
        ...useCases,
        SeedDomainMigrationExamples,
        ApprovedMovesCache,
        { provide: Clock, useClass: SystemClock },
        { provide: DomainMigrationRepository, useClass: MongoDomainMigrationRepository },
        { provide: MoveDevices, ...options.devices },
      ],
      exports: [...useCases, SeedDomainMigrationExamples],
    };
  }
}
