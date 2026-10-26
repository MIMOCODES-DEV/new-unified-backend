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
