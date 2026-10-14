// Public API of the module: the only file other modules and interfaces may import.
export { TemplateModule } from './template.module.js';
export {
  RenameExampleUseCase,
  type RenameExampleInput,
} from './application/use-cases/rename-example.use-case.js';
export type { Example } from './domain/example.entity.js';
export { ExampleNotFoundError, InvalidExampleNameError } from './domain/example.errors.js';
