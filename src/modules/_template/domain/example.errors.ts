import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidExampleNameError extends DomainError {
  readonly code = 'template.invalid_name';
}

export class ExampleNotFoundError extends DomainError {
  readonly code = 'template.not_found';
}
