/**
 * Device rules:
 * - One device = one TV/phone of one brand, identified by its MAC address (normalized).
 * - A new device starts with a trial license and state "pending" (not proven real yet).
 * - Device key: 6 digits (100000–999999), stored as text. Used to log in on the website.
 * - A paid license (yearly or lifetime) moves a pending device to "active".
 * - Active or not = what its license says (see license.ts).
 * - License changes go through the device, so the state rule above always runs.
 * - u_id: 6 letters/digits the V4 apps generate (stored uppercase). A device keeps the first one
 *   it logs in with; a different one later means the app's data was wiped (ownership check).
 */
import { DomainError } from '../../../shared/kernel/domain-error.js';
import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { AppType } from './app-type.js';
import type {
  License,
  LicenseAlreadyLifetimeError,
  LicenseAlreadyRevokedError,
} from './license.js';

export type DeviceState = 'pending' | 'active';

const DEVICE_KEY = /^[1-9]\d{5}$/;

const UID = /^[A-Z0-9]{6}$/;

export class InvalidDeviceKeyError extends DomainError {
  readonly code = 'devices.invalid_device_key';
}

export class InvalidUidError extends DomainError {
  readonly code = 'devices.invalid_uid';
}

/** Normalizes a u_id from an app: trimmed, uppercase, exactly 6 letters/digits. */
export function parseUid(input: string): Result<string, InvalidUidError> {
  const uid = input.trim().toUpperCase();
  if (!UID.test(uid)) {
    return err(new InvalidUidError('u_id must be exactly 6 letters or digits'));
  }
  return ok(uid);
}

export interface DeviceProps {
  id: string;
  mac: MacAddress;
  appType: AppType;
  deviceKey: string;
  /** null until a V4 app logs in (devices migrated from older apps have none). */
  uid: string | null;
  license: License;
  state: DeviceState;
  createdAt: Date;
}

export class Device {
  private constructor(private props: DeviceProps) {}

  static register(input: {
    id: string;
    mac: MacAddress;
    appType: AppType;
    deviceKey: string;
    uid?: string | null;
    trial: License;
    now: Date;
  }): Result<Device, InvalidDeviceKeyError> {
    if (!DEVICE_KEY.test(input.deviceKey)) {
      return err(new InvalidDeviceKeyError('A device key must be 6 digits'));
    }
    return ok(
      new Device({
        id: input.id,
        mac: input.mac,
        appType: input.appType,
        deviceKey: input.deviceKey,
        uid: input.uid ?? null,
        license: input.trial,
        state: 'pending',
        createdAt: input.now,
      }),
    );
  }

  /** Rebuilds a device from storage, without checking the rules. Only repositories call this. */
  static restore(props: DeviceProps): Device {
    return new Device({ ...props });
  }

  get id(): string {
    return this.props.id;
  }
  get mac(): MacAddress {
    return this.props.mac;
  }
  get appType(): AppType {
    return this.props.appType;
  }
  get deviceKey(): string {
    return this.props.deviceKey;
  }
  get uid(): string | null {
    return this.props.uid;
  }
  get license(): License {
    return this.props.license;
  }
  get state(): DeviceState {
    return this.props.state;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }

  /** Keeps the first u_id the device logs in with. Returns false if it already has one. */
  assignUid(uid: string): boolean {
    if (this.props.uid) return false;
    this.props.uid = uid;
    return true;
  }

  isActive(now: Date): boolean {
    return this.props.license.isActive(now);
  }

  extendYearly(now: Date): Result<void, LicenseAlreadyLifetimeError> {
    return this.applyPaid(this.props.license.extendYearly(now));
  }

  makeLifetime(): Result<void, LicenseAlreadyLifetimeError> {
    return this.applyPaid(this.props.license.makeLifetime());
  }

  revoke(): Result<void, LicenseAlreadyRevokedError> {
    const result = this.props.license.revoke();
    if (!result.ok) return result;
    this.props.license = result.value;
    return ok(undefined);
  }

  private applyPaid<E>(result: Result<License, E>): Result<void, E> {
    if (!result.ok) return result;
    this.props.license = result.value;
    this.props.state = 'active'; // a paying device is real use
    return ok(undefined);
  }
}
