import { Module } from '@nestjs/common';
import { ExampleRepository } from './application/ports/example.repository.js';
import { RenameExampleUseCase } from './application/use-cases/rename-example.use-case.js';
import { MongoExampleRepository } from './infrastructure/mongo-example.repository.js';

/**
 * The module is the only public door: it binds ports to adapters and exports use cases.
 * Other modules and interfaces import this file, never the folders inside it.
 */
@Module({
  providers: [
    RenameExampleUseCase,
    { provide: ExampleRepository, useClass: MongoExampleRepository },
  ],
  exports: [RenameExampleUseCase],
})
export class TemplateModule {}
