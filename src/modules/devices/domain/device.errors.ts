import { DomainError } from '../../../shared/kernel/domain-error.js';

export class DeviceNotFoundError extends DomainError {
  readonly code = 'devices.not_found';
}

/** The MAC already belongs to another device (in trialDevices or devices). */
export class MacInUseError extends DomainError {
  readonly code = 'devices.mac_in_use';
}
