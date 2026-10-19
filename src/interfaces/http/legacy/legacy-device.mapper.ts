/**
 * Translates our device into the fields old apps read. The only place the old numbers live.
 * - is_trial: trial 0 · revoked 1 · lifetime 2 · yearly 3 (PLAN §5.3)
 * - expire_date: "YYYY-MM-DD" (UTC). Lifetime has no date, so we send the far date old apps expect.
 * - V4 lock: a device that has logged in with V4 (it has a u_id) is refused on the older routes,
 *   so nobody can skip the V4 captcha by calling an old route for that MAC (ibo and cr do this).
 */
import type { Device } from '../../../modules/devices/index.js';

const LIFETIME_EXPIRE_DATE = '2438-11-01';
const IS_TRIAL = { trial: 0, yearly: 3, lifetime: 2 } as const;

/** Old apps read urls[0] at start-up and crash on an empty list; playlists come later. */
export const DEMO_PLAYLIST = {
  id: 'demo',
  playlist_name: 'Sample',
  url: '',
  username: '',
  password: '',
  epg_url: '',
  playlist_type: 'general',
};

export function legacyIsTrial(device: Device): 0 | 1 | 2 | 3 {
  return device.license.revoked ? 1 : IS_TRIAL[device.license.type];
}

export function legacyExpireDate(device: Device): string {
  const expiresAt = device.license.expiresAt;
  return expiresAt ? expiresAt.toISOString().slice(0, 10) : LIFETIME_EXPIRE_DATE;
}

export function isV4Locked(device: Device): boolean {
  return device.uid !== null;
}

/**
 * The device-info reply of the v1 and v2 routes: the union of the fields the three old backends
 * sent (each app reads its subset; extra fields are ignored). Recorded old replies:
 * test/fixtures/legacy/http/*.json ("legacy playlist_info").
 */
export function legacyDeviceInfo(
  device: Device,
  context: { created: boolean; trialDays: number; ip: string },
) {
  return {
    mac_registered: !context.created,
    mac_address: device.mac.value,
    device_key: device.deviceKey,
    is_trial: legacyIsTrial(device),
    expire_date: legacyExpireDate(device),
    trial_days: context.trialDays,
    is_expired: false,
    status: 'success',
    urls: [DEMO_PLAYLIST],
    has_own_playlist: false,
    themes: [],
    notification: { title: '', content: '' },
    notifications: [],
    real_time_notification: '0',
    notification_interval: 300,
    languages: [],
    parent_pin: '0000',
    stalker_enabled: false,
    ip_address: context.ip,
  };
}
