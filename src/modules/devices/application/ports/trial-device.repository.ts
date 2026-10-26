import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { DeviceSettingsChange, DeviceVisit, TrialDevice } from '../../domain/device.js';

/** The current brand's `trialDevices`: devices that never paid. */
export abstract class TrialDeviceRepository {
  abstract findById(id: string): Promise<TrialDevice | null>;
  abstract findByMac(mac: MacAddress): Promise<TrialDevice | null>;
  abstract findByAppDeviceId(appDeviceId: string): Promise<TrialDevice | null>;
  abstract findByUid(uid: string): Promise<TrialDevice | null>;
  /** By the old backend's `_id` (`legacy.id`). */
  abstract findByLegacyId(legacyId: string): Promise<TrialDevice | null>;
  abstract insert(device: TrialDevice): Promise<void>;
  /** Sets platform, lastSeenAt, ip, appVersion and apiVersion only; false when it is not there. */
  abstract recordVisit(id: string, visit: DeviceVisit): Promise<boolean>;
  /** Sets the given owner fields only; false when it is not there. */
  abstract changeSettings(id: string, change: DeviceSettingsChange): Promise<boolean>;
  /** Replaces the stored device; false when it is not there. */
  abstract update(device: TrialDevice): Promise<boolean>;
  /** False when it was already gone. */
  abstract delete(id: string): Promise<boolean>;
}
