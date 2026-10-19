import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { AppDeviceId } from '../../domain/device-identity.js';
import type { Device } from '../../domain/device.entity.js';

export type InsertResult = 'inserted' | 'mac_taken' | 'key_taken' | 'app_device_id_taken';
export type MoveResult = 'moved' | 'not_pending';

/**
 * Storage for the current brand's devices: `pendingDevices` (not paid, kept forever)
 * and `devices` (paid only). The MongoDB version lives in infrastructure/.
 */
export abstract class DeviceRepository {
  /** A paid device, from `devices`. */
  abstract findPaidByMac(mac: MacAddress): Promise<Device | null>;
  /** A device that has not paid, from `pendingDevices`. */
  abstract findPendingByMac(mac: MacAddress): Promise<Device | null>;
  /** A paid device by its install id (devices without a usable MAC). */
  abstract findPaidByAppDeviceId(id: AppDeviceId): Promise<Device | null>;
  abstract findPendingByAppDeviceId(id: AppDeviceId): Promise<Device | null>;
  /** Inserts into `pendingDevices`. `key_taken` if the device key exists in either collection. */
  abstract insertPending(device: Device): Promise<InsertResult>;
  /** Saves the visit and V4 state (`lastSeenAt`, `uid`, `v4Verified`) wherever the device lives. */
  abstract touch(device: Device): Promise<void>;
  /**
   * Atomically inserts the (already activated) device into `devices` and deletes it from
   * `pendingDevices`. `not_pending` if it was no longer pending or its MAC is already paid.
   */
  abstract moveToPaid(device: Device): Promise<MoveResult>;
}
