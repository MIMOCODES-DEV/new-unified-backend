import { DomainError } from '../../../shared/kernel/domain-error.js';

/** A running lifetime license cannot get a year or another lifetime. */
export class AlreadyLifetimeError extends DomainError {
  readonly code = 'licensing.already_lifetime';
}

/** No device with this id in the brand. */
export class LicensedDeviceNotFoundError extends DomainError {
  readonly code = 'licensing.device_not_found';
}

/** The trial device cannot move to devices: its app device id is already on a paid device. */
export class DeviceConflictError extends DomainError {
  readonly code = 'licensing.device_conflict';
}

/** A trial device has no license to revoke. */
export class NoLicenseError extends DomainError {
  readonly code = 'licensing.no_license';
}

export class AlreadyRevokedError extends DomainError {
  readonly code = 'licensing.already_revoked';
}
