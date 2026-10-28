import { DomainError } from '../../../shared/kernel/domain-error.js';

export class DeviceNotFoundError extends DomainError {
  readonly code = 'devices.not_found';
}

/** The app device id already belongs to another device (in trialDevices or devices). */
export class AppDeviceIdInUseError extends DomainError {
  readonly code = 'devices.app_device_id_in_use';
}

/** The MAC already belongs to another device (in trialDevices or devices). */
export class MacInUseError extends DomainError {
  readonly code = 'devices.mac_in_use';
}

/** A V4 device called as another platform: its stored platform is trusted, so the call is refused. */
export class PlatformMismatchError extends DomainError {
  readonly code = 'devices.platform_mismatch';
}

/** A device key must be 6 digits. */
export class InvalidDeviceKeyError extends DomainError {
  readonly code = 'devices.invalid_device_key';
}

/** A parent PIN must be 4 digits (or none). */
export class InvalidParentPinError extends DomainError {
  readonly code = 'devices.invalid_parent_pin';
}

/** No device has this MAC and device key. Same answer for an unknown MAC, so MACs cannot be probed. */
export class DeviceKeyMismatchError extends DomainError {
  readonly code = 'devices.device_key_mismatch';
}

/** A device without a usable MAC sent neither an app device id nor a uid: nothing identifies it. */
export class DeviceIdMissingError extends DomainError {
  readonly code = 'devices.device_id_missing';
}

/** The captcha answer is wrong, or the captcha expired, was already answered or is for another device. */
export class InvalidCaptchaError extends DomainError {
  readonly code = 'devices.invalid_captcha';
}

/** A device that never solved a captcha must send one (V4 registration). */
export class CaptchaRequiredError extends DomainError {
  readonly code = 'devices.captcha_required';
}

/**
 * The V4 app sent another uid than the stored one (its data was wiped, or another app copies the
 * MAC). The app must solve the uid recovery captcha, which shows the stored uid.
 */
export class UidMismatchError extends DomainError {
  readonly code = 'devices.uid_mismatch';
}

/** A V4 uid is 6 letters or digits. */
export class InvalidUidError extends DomainError {
  readonly code = 'devices.invalid_uid';
}

/** V4 login needs a real MAC, because a captcha is solved for a MAC. */
export class UsableMacRequiredError extends DomainError {
  readonly code = 'devices.usable_mac_required';
}

/** The device used a newer app API (V4); an older entry point is refused (the V4 lock). */
export class OlderApiRefusedError extends DomainError {
  readonly code = 'devices.older_api_refused';
}

/** A MAC switch to the MAC the device already has. */
export class SameMacError extends DomainError {
  readonly code = 'devices.same_mac';
}

/** The device has made as many MAC switches as the brand allows (`macSwitch.maxPerDevice`). */
export class MacSwitchLimitError extends DomainError {
  readonly code = 'devices.mac_switch_limit';
}

/** Another device holds the same recovery code (rare: a new code is drawn). */
export class RecoveryCodeTakenError extends DomainError {
  readonly code = 'devices.recovery_code_taken';
}

/** A MAC switch goes only to a MAC whose app already registered (old: "install the app first"). */
export class NewMacNotRegisteredError extends DomainError {
  readonly code = 'devices.new_mac_not_registered';
}
