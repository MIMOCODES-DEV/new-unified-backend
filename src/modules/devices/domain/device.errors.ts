import { DomainError } from '../../../shared/kernel/domain-error.js';

export class InvalidAppTypeError extends DomainError {
  readonly code = 'devices.invalid_app_type';
}

export class DeviceNotFoundError extends DomainError {
  readonly code = 'devices.not_found';
}

export class InvalidTrialDaysError extends DomainError {
  readonly code = 'devices.invalid_trial_days';
}

export class InvalidUidError extends DomainError {
  readonly code = 'devices.invalid_uid';
}

export class CaptchaRequiredError extends DomainError {
  readonly code = 'devices.captcha_required';
}

export class CaptchaInvalidError extends DomainError {
  readonly code = 'devices.captcha_invalid';
}

export class DeviceNotRegisteredError extends DomainError {
  readonly code = 'devices.not_registered';
}

export class DeviceTokenInvalidError extends DomainError {
  readonly code = 'devices.token_invalid';
}

export class DeviceTokenMacMismatchError extends DomainError {
  readonly code = 'devices.token_mac_mismatch';
}

export class InvalidAppDeviceIdError extends DomainError {
  readonly code = 'devices.invalid_app_device_id';
}

/** Neither a usable MAC nor an app_device_id: nothing identifies the device. */
export class DeviceIdentityRequiredError extends DomainError {
  readonly code = 'devices.identity_required';
}

export class InvalidLegacyProfileError extends DomainError {
  readonly code = 'devices.invalid_legacy_profile';
}

/** An iOS/Android v2-v3 app sent a different install uid than the one the device registered with. */
export class DeviceUidMismatchError extends DomainError {
  readonly code = 'devices.uid_mismatch';
}
