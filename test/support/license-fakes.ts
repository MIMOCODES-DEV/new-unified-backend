import { DeviceIdentity } from '../../src/modules/devices/application/device-identity.js';
import { ApplyLicenseUseCase } from '../../src/modules/devices/application/use-cases/apply-license.use-case.js';
import { FindDeviceByIdUseCase } from '../../src/modules/devices/application/use-cases/find-device-by-id.use-case.js';
import type { LicenseLock } from '../../src/modules/licensing/application/ports/license-lock.js';
import {
  LicensedDevices,
  type PaidBy,
} from '../../src/modules/licensing/application/ports/licensed-devices.js';
import {
  type InMemoryPaidDeviceRepository,
  type InMemoryTrialDeviceRepository,
  InProcessDeviceLock,
} from './device-fakes.js';
import type { LicenseRepository } from '../../src/modules/licensing/application/ports/license.repository.js';
import type { License } from '../../src/modules/licensing/domain/license.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

export class InMemoryLicenseRepository implements LicenseRepository {
  readonly items = new Map<string, License>();

  async findById(id: string): Promise<License | null> {
    await tick();
    return this.items.get(id) ?? null;
  }
  async listByDevice(deviceId: string): Promise<License[]> {
    await tick();
    return [...this.items.values()]
      .filter((l) => l.deviceId === deviceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async findBySource(deviceId: string, sourceId: string): Promise<License | null> {
    await tick();
    return (
      [...this.items.values()].find((l) => l.deviceId === deviceId && l.sourceId === sourceId) ??
      null
    );
  }
  async insert(license: License): Promise<void> {
    await tick();
    // Same rule as the device_source_unique index.
    if (license.sourceId && (await this.findBySource(license.deviceId, license.sourceId))) {
      throw new Error('E11000 duplicate key: licenses.device_source_unique');
    }
    this.items.set(license.id, license);
  }
  async update(license: License): Promise<boolean> {
    await tick();
    if (!this.items.has(license.id)) return false;
    this.items.set(license.id, license);
    return true;
  }
  async delete(id: string): Promise<boolean> {
    await tick();
    return this.items.delete(id);
  }
}

/** One lock per device inside this process: what the Redis lock does across servers. */
export class InProcessLicenseLock implements LicenseLock {
  private readonly tails = new Map<string, Promise<unknown>>();

  withDevice<T>(deviceId: string, fn: () => Promise<T>): Promise<T> {
    const before = this.tails.get(deviceId) ?? Promise.resolve();
    const result = before.then(fn, fn);
    this.tails.set(
      deviceId,
      result.catch(() => undefined),
    );
    return result;
  }
}

/**
 * Licensing connected to the real devices use cases on in-memory repositories, bound the way
 * src/module-settings.ts binds them, so a trial device really moves to devices.
 */
export function devicesForLicensing(
  trials: InMemoryTrialDeviceRepository,
  paid: InMemoryPaidDeviceRepository,
): LicensedDevices {
  const identity = new DeviceIdentity(trials, paid, new InProcessDeviceLock());
  const findDevice = new FindDeviceByIdUseCase(identity);
  const applyLicense = new ApplyLicenseUseCase(identity, paid);
  return new (class extends LicensedDevices {
    async find(deviceId: string) {
      const found = await findDevice.execute(deviceId);
      if (!found.ok) return null;
      const { paid: isPaid, device } = found.value;
      return isPaid
        ? {
            id: device.id,
            paid: true,
            trialEndsAt: null,
            currentLicenseId: device.currentLicenseId,
          }
        : { id: device.id, paid: false, trialEndsAt: device.trialEndsAt, currentLicenseId: null };
    }
    async markPaid(deviceId: string, paidBy: PaidBy) {
      const applied = await applyLicense.execute({ deviceId, ...paidBy });
      if (applied.ok) return 'done' as const;
      return applied.error.code === 'devices.not_found'
        ? ('not_found' as const)
        : ('conflict' as const);
    }
  })();
}
