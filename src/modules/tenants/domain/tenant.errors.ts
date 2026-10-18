import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidTenantError extends DomainError {
  readonly code = 'tenants.invalid';
}

export class UnknownHostError extends DomainError {
  readonly code = 'tenants.unknown_host';
}

export class TenantDisabledError extends DomainError {
  readonly code = 'tenants.disabled';
}

export class TenantConflictError extends DomainError {
  readonly code = 'tenants.conflict';
}
