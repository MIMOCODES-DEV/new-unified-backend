import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { Device } from '../../domain/device.entity.js';

/** What the device use cases need from storage, in the current brand's database. */
export abstract class DeviceRepository {
  abstract findByMac(mac: MacAddress): Promise<Device | null>;
  /**
   * Saves a new device. Returns false if a device with the same MAC already exists
   * (two requests registering the same MAC at the same moment): the caller reads it instead.
   */
  abstract insert(device: Device): Promise<boolean>;
  /** Updates an existing device. */
  abstract save(device: Device): Promise<void>;
}
