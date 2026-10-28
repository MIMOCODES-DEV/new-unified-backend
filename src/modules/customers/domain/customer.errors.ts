import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidCustomerInputError extends DomainError {
  readonly code = 'customers.invalid_input';
}

export class CustomerEmailTakenError extends DomainError {
  readonly code = 'customers.email_taken';
}

/** Wrong password or unknown email: the same answer for both. */
export class InvalidCustomerCredentialsError extends DomainError {
  readonly code = 'customers.invalid_credentials';
}

/** Right password, but the email link was not opened yet. */
export class EmailNotVerifiedError extends DomainError {
  readonly code = 'customers.email_not_verified';
}

/** Unknown, used or expired link. */
export class InvalidLinkError extends DomainError {
  readonly code = 'customers.invalid_link';
}

export class CustomerNotFoundError extends DomainError {
  readonly code = 'customers.not_found';
}

export class CustomerDeviceError extends DomainError {
  constructor(
    readonly code:
      | 'customers.device_key_mismatch'
      | 'customers.device_not_paid'
      | 'customers.device_linked_elsewhere'
      | 'customers.device_not_found',
    message: string,
  ) {
    super(message);
  }
}
