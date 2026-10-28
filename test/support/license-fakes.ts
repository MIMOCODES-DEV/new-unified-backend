import { DeviceIdentity } from '../../src/modules/devices/application/device-identity.js';
import { ApplyLicenseUseCase } from '../../src/modules/devices/application/use-cases/apply-license.use-case.js';
import { FindDeviceByIdUseCase } from '../../src/modules/devices/application/use-cases/find-device-by-id.use-case.js';
import { SwitchDeviceMacUseCase } from '../../src/modules/devices/application/use-cases/switch-device-mac.use-case.js';
import { SetRecoveryCodeUseCase } from '../../src/modules/devices/application/use-cases/set-recovery-code.use-case.js';
import { FindDeviceByRecoveryCodeUseCase } from '../../src/modules/devices/application/use-cases/find-device-by-recovery-code.use-case.js';
import { RecoverDeviceUseCase } from '../../src/modules/devices/application/use-cases/recover-device.use-case.js';
import { ListStaleTrialDevicesUseCase } from '../../src/modules/devices/application/use-cases/list-stale-trial-devices.use-case.js';
import { DeleteStaleTrialDeviceUseCase } from '../../src/modules/devices/application/use-cases/delete-stale-trial-device.use-case.js';
import { RandomDeviceKeyGenerator } from '../../src/modules/devices/infrastructure/random-device-key.generator.js';
import { DeviceSettings } from '../../src/modules/devices/application/ports/device-settings.js';
import type { Clock } from '../../src/shared/kernel/clock.js';
import { SystemClock } from '../../src/shared/kernel/clock.js';
import type { LicenseLock } from '../../src/modules/licensing/application/ports/license-lock.js';
import {
  LicensedDevices,
  type MacSwitchOutcome,
  type PaidBy,
  type RecoveryOutcome,
  type StaleTrialRule,
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

/** The brand's MAC switch limit (`macSwitch.maxPerDevice`); the other device settings are unused. */
export class SwitchSettings extends DeviceSettings {
  maxSwitches = 1;
  trialDays() {
    return Promise.resolve(7);
  }
  reviewBuilds() {
    return Promise.resolve([]);
  }
  maxMacSwitches() {
    return Promise.resolve(this.maxSwitches);
  }
}

/** A devices-side switch refusal, as src/module-settings.ts maps it for licensing. */
const SWITCH_REFUSALS: Record<string, Exclude<MacSwitchOutcome['status'], 'done'>> = {
  'devices.not_found': 'not_found',
  'kernel.invalid_mac_address': 'invalid_mac',
  'devices.usable_mac_required': 'invalid_mac',
  'devices.same_mac': 'same_mac',
  'devices.mac_switch_limit': 'limit_reached',
  'devices.new_mac_not_registered': 'not_registered',
  'devices.mac_in_use': 'mac_taken',
};

/** A devices-side recovery refusal, as src/module-settings.ts maps it for licensing. */
const RECOVERY_REFUSALS: Record<string, Exclude<RecoveryOutcome['status'], 'done'>> = {
  'devices.not_found': 'not_found',
  'kernel.invalid_mac_address': 'invalid_mac',
  'devices.usable_mac_required': 'invalid_mac',
  'devices.same_mac': 'same_mac',
  'devices.new_mac_not_registered': 'not_registered',
  'devices.mac_in_use': 'mac_taken',
};

/**
 * Licensing connected to the real devices use cases on in-memory repositories, bound the way
 * src/module-settings.ts binds them, so a trial device really moves to devices.
 */
export function devicesForLicensing(
  trials: InMemoryTrialDeviceRepository,
  paid: InMemoryPaidDeviceRepository,
  settings: DeviceSettings = new SwitchSettings(),
  clock: Clock = new SystemClock(),
): LicensedDevices {
  const identity = new DeviceIdentity(trials, paid, new InProcessDeviceLock());
  const keys = new RandomDeviceKeyGenerator();
  const setRecoveryCode = new SetRecoveryCodeUseCase(paid, clock);
  const findByRecoveryCode = new FindDeviceByRecoveryCodeUseCase(paid);
  const recover = new RecoverDeviceUseCase(identity, paid, keys, clock);
  const listStale = new ListStaleTrialDevicesUseCase(trials);
  const deleteStale = new DeleteStaleTrialDeviceUseCase(identity);
  const findDevice = new FindDeviceByIdUseCase(identity);
  const applyLicense = new ApplyLicenseUseCase(identity, paid);
  const switchDeviceMac = new SwitchDeviceMacUseCase(identity, paid, settings, keys, clock);
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
    async switchMac(
      deviceId: string,
      newMac: string,
      takeOver: (trialDeviceId: string) => Promise<void>,
    ): Promise<MacSwitchOutcome> {
      const switched = await switchDeviceMac.execute({ deviceId, newMac, takeOver });
      if (!switched.ok) return { status: SWITCH_REFUSALS[switched.error.code] ?? 'not_found' };
      const record = switched.value.device.switch!;
      return {
        status: 'done',
        from: record.from,
        to: record.to,
        at: record.at,
        count: record.count,
        absorbedTrialId: switched.value.absorbedTrialId,
      };
    }
    async setRecoveryCode(deviceId: string, code: string, expiresAt: Date) {
      const set = await setRecoveryCode.execute({ deviceId, code, expiresAt });
      if (set.ok) return 'done' as const;
      return set.error.code === 'devices.recovery_code_taken'
        ? ('taken' as const)
        : ('not_found' as const);
    }
    async findByRecoveryCode(code: string) {
      const found = await findByRecoveryCode.execute(code);
      return found.ok ? { id: found.value.id, expiresAt: found.value.recovery!.expiresAt } : null;
    }
    async recover(
      deviceId: string,
      newMac: string,
      removeTrial: (trialDeviceId: string) => Promise<void>,
    ): Promise<RecoveryOutcome> {
      const recovered = await recover.execute({ deviceId, newMac, removeTrial });
      if (!recovered.ok) return { status: RECOVERY_REFUSALS[recovered.error.code] ?? 'not_found' };
      const { device, removedTrialId } = recovered.value;
      return {
        status: 'done',
        from: device.recovery!.recoveredFrom!,
        to: device.macAddress,
        at: device.recovery!.recoveredAt!,
        removedTrialId,
      };
    }
    async listStaleTrials(rule: StaleTrialRule, limit: number) {
      return (await listStale.execute({ ...rule, limit })).map((t) => ({
        id: t.id,
        macAddress: t.macAddress,
        trialEndsAt: t.trialEndsAt,
        lastSeenAt: t.lastSeenAt,
      }));
    }
    deleteStaleTrial(
      deviceId: string,
      rule: StaleTrialRule,
      removePlaylists: (deviceId: string) => Promise<void>,
    ) {
      return deleteStale.execute({ deviceId, ...rule, removePlaylists });
    }
  })();
}
