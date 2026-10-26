import type { MacAddress } from '../../../../shared/kernel/mac-address.js';

/**
 * What playlists need from the devices module, bound at the process root (src/module-settings.ts):
 * a module may not import another module.
 */
export abstract class PlaylistDevices {
  /** The id of the device with this MAC in the current brand, trial or paid. */
  abstract findIdByMac(mac: MacAddress): Promise<string | null>;
  /** Playlists were added (+n) or removed (-n): keeps the trial device's counters in step. */
  abstract playlistCountChanged(deviceId: string, delta: number): Promise<void>;
}
