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

/** Only a paid device (in `devices`) has a license to move to a new MAC. */
export class SwitchNeedsPaidDeviceError extends DomainError {
  readonly code = 'licensing.switch_needs_paid_device';
}

/** A MAC switch or a recovery needs a running license: not expired, not revoked. */
export class LicenseNotRunningError extends DomainError {
  readonly code = 'licensing.license_not_running';
}

/** A license bought in a multi-device store order cannot move to another MAC. */
export class MultiActivateSwitchError extends DomainError {
  readonly code = 'licensing.multi_activate_switch';
}

/** A yearly license moves to another MAC only when the caller allows it (old `allow_one_year`). */
export class YearlySwitchNotAllowedError extends DomainError {
  readonly code = 'licensing.yearly_switch_not_allowed';
}

/** The new MAC (switch or recovery) is not a valid MAC, or is a shared placeholder MAC. */
export class InvalidSwitchMacError extends DomainError {
  readonly code = 'licensing.invalid_mac';
}

/** The device already has the new MAC. */
export class SameMacError extends DomainError {
  readonly code = 'licensing.same_mac';
}

/** The device has made as many MAC switches as the brand allows (`macSwitch.maxPerDevice`). */
export class MacSwitchLimitError extends DomainError {
  readonly code = 'licensing.mac_switch_limit';
}

/** The new MAC already belongs to a paid device. */
export class MacTakenError extends DomainError {
  readonly code = 'licensing.mac_taken';
}

/** No app registered the new MAC yet: the app must be installed on the new device first. */
export class NewMacNotRegisteredError extends DomainError {
  readonly code = 'licensing.new_mac_not_registered';
}

/** Only a paid device (in `devices`) gets a recovery code. */
export class RecoveryNeedsPaidDeviceError extends DomainError {
  readonly code = 'licensing.recovery_needs_paid_device';
}

/** No device has this recovery code: it is wrong, or it was used already. */
export class RecoveryCodeNotFoundError extends DomainError {
  readonly code = 'licensing.recovery_code_not_found';
}

/** The recovery code is older than 30 minutes; the website makes a new one. */
export class RecoveryCodeExpiredError extends DomainError {
  readonly code = 'licensing.recovery_code_expired';
}
