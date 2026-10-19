import { DeviceRepository } from '../../src/modules/devices/application/ports/device.repository.js';
import type { Device } from '../../src/modules/devices/domain/device.entity.js';
import type { MacAddress } from '../../src/shared/kernel/mac-address.js';

/** Test double: keeps devices in a Map keyed by MAC, like the unique index in MongoDB. */
export class InMemoryDeviceRepository extends DeviceRepository {
  readonly items = new Map<string, Device>();

  findByMac(mac: MacAddress): Promise<Device | null> {
    return Promise.resolve(this.items.get(mac.value) ?? null);
  }

  save(device: Device): Promise<void> {
    this.items.set(device.mac.value, device);
    return Promise.resolve();
  }

  insert(device: Device): Promise<boolean> {
    if (this.items.has(device.mac.value)) return Promise.resolve(false);
    this.items.set(device.mac.value, device);
    return Promise.resolve(true);
  }
}
