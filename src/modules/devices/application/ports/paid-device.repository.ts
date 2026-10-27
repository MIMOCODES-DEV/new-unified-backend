import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { PaidDevice } from '../../domain/device.js';

/** The current brand's `devices`: devices that paid at least once. They are never deleted. */
export abstract class PaidDeviceRepository {
  abstract findById(id: string): Promise<PaidDevice | null>;
  abstract findByMac(mac: MacAddress): Promise<PaidDevice | null>;
  abstract findByAppDeviceId(appDeviceId: string): Promise<PaidDevice | null>;
  abstract findByUid(uid: string): Promise<PaidDevice | null>;
  /** By the old backend's `_id` (`legacy.id`). */
  abstract findByLegacyId(legacyId: string): Promise<PaidDevice | null>;
  abstract insert(device: PaidDevice): Promise<void>;
  /** Replaces the stored device; false when it is not there. */
  abstract update(device: PaidDevice): Promise<boolean>;
}
