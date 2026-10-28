import { DomainError } from '../../../shared/kernel/domain-error.js';

/** Wrong password or unknown email: the same answer for both. */
export class InvalidStaffCredentialsError extends DomainError {
  readonly code = 'staff.invalid_credentials';
}

export class StaffDisabledError extends DomainError {
  readonly code = 'staff.disabled';
}

/** No session, an ended one, or a staff member removed or disabled since. */
export class StaffUnauthenticatedError extends DomainError {
  readonly code = 'staff.unauthenticated';
}

export class MissingPermissionError extends DomainError {
  readonly code = 'staff.missing_permission';
}

export class BrandNotAllowedError extends DomainError {
  readonly code = 'staff.brand_not_allowed';
}

export class StaffNotFoundError extends DomainError {
  readonly code = 'staff.not_found';
}

export class StaffEmailTakenError extends DomainError {
  readonly code = 'staff.email_taken';
}

export class InvalidStaffInputError extends DomainError {
  readonly code = 'staff.invalid_input';
}

/** Nobody disables, or changes the role of, their own account (no locking yourself out). */
export class CannotChangeSelfError extends DomainError {
  readonly code = 'staff.cannot_change_self';
}

export class InvalidTwoFactorCodeError extends DomainError {
  readonly code = 'staff.invalid_two_factor_code';
}

export class TwoFactorStateError extends DomainError {
  readonly code = 'staff.two_factor_state';
}

export class RoleNotFoundError extends DomainError {
  readonly code = 'staff.role_not_found';
}

export class RoleNameTakenError extends DomainError {
  readonly code = 'staff.role_name_taken';
}

/** super_admin is fixed: never edited or deleted. */
export class SystemRoleError extends DomainError {
  readonly code = 'staff.system_role';
}

export class RoleInUseError extends DomainError {
  readonly code = 'staff.role_in_use';
}

/** A role may only list keys that exist and are active. */
export class UnknownPermissionError extends DomainError {
  readonly code = 'staff.unknown_permission';
}

export class PermissionNotFoundError extends DomainError {
  readonly code = 'staff.permission_not_found';
}
