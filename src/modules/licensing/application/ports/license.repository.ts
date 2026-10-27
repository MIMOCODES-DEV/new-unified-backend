import type { License } from '../../domain/license.js';

/** The current brand's `licenses`. */
export abstract class LicenseRepository {
  abstract findById(id: string): Promise<License | null>;
  /** A device's full history, oldest first. */
  abstract listByDevice(deviceId: string): Promise<License[]>;
  /** The license this source already gave this device, if any (activating twice does nothing). */
  abstract findBySource(deviceId: string, sourceId: string): Promise<License | null>;
  abstract insert(license: License): Promise<void>;
  /** Replaces the stored license; false when it is not there. */
  abstract update(license: License): Promise<boolean>;
}
