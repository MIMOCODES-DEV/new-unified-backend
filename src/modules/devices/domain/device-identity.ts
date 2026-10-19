import type { MacAddress } from '../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { InvalidAppDeviceIdError } from './device.errors.js';

/**
 * MACs that many different devices report (DEV-10): QEMU/emulator defaults used as fallbacks by
 * BobPlayer (…:57), CRPlayer (…:59) and some no-MAC TVs (…:56). Treating them as one device would
 * merge strangers' trials and playlists, so they are handled like "no MAC": the app_device_id
 * identifies the device, and it gets its own random MAC.
 */
const SHARED_FALLBACK_MACS = new Set([
  '52:54:00:12:34:56',
  '52:54:00:12:34:57',
  '52:54:00:12:34:59',
]);

export function isSharedFallbackMac(mac: MacAddress): boolean {
  return SHARED_FALLBACK_MACS.has(mac.value);
}

const MAX_APP_DEVICE_ID_LENGTH = 128;
const PRINTABLE = /^[\x21-\x7e][\x20-\x7e]*$/;

/** The per-install id some apps send (`app_device_id`), used when the device has no usable MAC. */
export class AppDeviceId {
  private constructor(readonly value: string) {}

  static parse(input: unknown): Result<AppDeviceId, InvalidAppDeviceIdError> {
    const value = typeof input === 'string' ? input.trim() : '';
    if (!value || value.length > MAX_APP_DEVICE_ID_LENGTH || !PRINTABLE.test(value)) {
      return err(new InvalidAppDeviceIdError('Invalid app_device_id', { input }));
    }
    return ok(new AppDeviceId(value));
  }

  equals(other: AppDeviceId): boolean {
    return this.value === other.value;
  }
}

/** The install uid iOS and Android v2-v3 apps send with every login (`uid`). */
export class AppUid {
  private constructor(readonly value: string) {}

  static parse(input: unknown): Result<AppUid, InvalidAppDeviceIdError> {
    const parsed = AppDeviceId.parse(input); // same character and length rules
    return parsed.ok ? ok(new AppUid(parsed.value.value)) : parsed;
  }

  equals(other: AppUid): boolean {
    return this.value === other.value;
  }
}
