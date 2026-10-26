import { DomainError } from '../../../shared/kernel/domain-error.js';

/** A running lifetime license cannot get a year or another lifetime. */
export class AlreadyLifetimeError extends DomainError {
  readonly code = 'licensing.already_lifetime';
}
