import { DomainError } from '../../../shared/kernel/domain-error.js';

export class HostMoveNotFoundError extends DomainError {
  readonly code = 'domain_migrations.not_found';
}

/** A decision needs the name (or id) of the staff member who makes it. */
export class InvalidDeciderError extends DomainError {
  readonly code = 'domain_migrations.invalid_decider';
}
