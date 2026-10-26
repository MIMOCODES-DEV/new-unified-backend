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

/** A device without a usable MAC sent neither an app device id nor a uid: nothing identifies it. */
export class DeviceIdMissingError extends DomainError {
  readonly code = 'devices.device_id_missing';
}
