import type { LegacyProfile } from '../../../modules/devices/index.js';
import { legacyAccessEnd, legacyExpireDate, legacyIsTrial } from '../legacy-license.js';

/**
 * Response bodies of the old apps' registration routes, per old backend ("legacy profile"), with
 * the exact key order and field types installed apps parse (test/fixtures/legacy/http/*.json).
 * Settings-driven parts (themes, languages, notifications, demo playlist URL, app updates) are sent
 * empty until those features exist (CNT / PL); their keys and types are kept.
 */

export interface LegacyDeviceView {
  macAddress: string;
  deviceKey: string;
  isPaid: boolean;
  trialExpiresAt: Date;
  activatedAt: Date | null;
}

export interface RegistrationView {
  device: LegacyDeviceView;
  /** True when this request created the device (old backends answered slightly differently). */
  created: boolean;
  trialDays: number;
  /** The caller's IP as each old backend computed it; '' when unknown. */
  ipAddress: string;
}

const EMPTY_NOTIFICATION = { title: '', content: '' };

/** The old code sent the key as a number to a new device and as the stored string afterwards. */
function deviceKey(view: RegistrationView): number | string {
  return view.created ? Number(view.device.deviceKey) : view.device.deviceKey;
}

/** Old demo playlist entries when no demo URL is configured, per backend. */
function demoPlaylist(profile: LegacyProfile, created: boolean): Record<string, unknown> {
  if (profile === 'ibo') return { origin_type: 'general' };
  if (profile === 'bob') return { id: 'demo', playlist_name: 'Sample' };
  const demo: Record<string, unknown> = {
    id: 'demo',
    playlist_name: 'Sample',
    username: '',
    password: '',
    epg_url: '',
    playlist_type: 'general',
  };
  return created ? demo : { ...demo, backup_urls: [] };
}

/** bob's body, shared by its legacy TV route and by bob's and cr's signed Android route. */
function bobStyleBody(
  profile: LegacyProfile,
  view: RegistrationView,
  withIp: boolean,
): Record<string, unknown> {
  return {
    has_own_playlist: false,
    real_time_notification: '0',
    notification_interval: 300,
    mac_registered: !view.created,
    urls: [demoPlaylist(profile, view.created)],
    ...(withIp ? { ip_address: view.ipAddress } : {}),
    trial_days: String(view.trialDays),
    device_key: deviceKey(view),
    is_trial: legacyIsTrial(view.device),
    expire_date: legacyExpireDate(view.device),
    mac_address: view.device.macAddress,
    status: 'success',
    is_expired: false,
    notification: EMPTY_NOTIFICATION,
    languages: [],
  };
}

/** `POST /api/playlist_info` (legacy TV, obfuscated envelope). */
export function playlistInfoBody(
  profile: LegacyProfile,
  view: RegistrationView,
): Record<string, unknown> {
  const { device } = view;
  if (profile === 'ibo') {
    const head = {
      mac_registered: !view.created,
      urls: [demoPlaylist(profile, view.created)],
      themes: [],
      has_own_playlist: false,
      trial_days: view.trialDays,
      parent_pin: view.created ? '' : '0000',
      ip_address: view.ipAddress,
      notification: EMPTY_NOTIFICATION,
      languages: [],
      tmdb_api_key: '', // was a hard-coded third-party key; becomes a per-brand setting (CNT)
    };
    const licence = {
      is_trial: legacyIsTrial(device),
      expire_date: legacyExpireDate(device),
    };
    return view.created
      ? {
          ...head,
          device_key: deviceKey(view),
          ...licence,
          mac_address: device.macAddress,
          stalker_enabled: false,
        }
      : {
          ...head,
          mac_address: device.macAddress,
          device_key: deviceKey(view),
          ...licence,
          stalker_enabled: false,
        };
  }
  if (profile === 'bob') return bobStyleBody(profile, view, true);
  return {
    has_own_playlist: false,
    mac_registered: !view.created,
    ...(view.ipAddress ? { ip_address: view.ipAddress } : {}), // cr omitted it without a proxy header
    urls: [demoPlaylist(profile, view.created)],
    themes: [],
    notifications: [],
    trial_days: view.trialDays,
    device_key: deviceKey(view),
    is_trial: legacyIsTrial(device),
    expire_date: legacyExpireDate(device),
    status: 'success',
    is_expired: false,
    languages: [],
  };
}

/** `POST /api/MBBPj5UwlCmTstXGb/android/playlist_information` (signed Android, AES). */
export function signedAndroidBody(
  profile: LegacyProfile,
  view: RegistrationView,
): Record<string, unknown> {
  const { device } = view;
  if (profile !== 'ibo') return bobStyleBody(profile, view, profile === 'bob');
  const head = {
    mac_registered: !view.created,
    urls: [demoPlaylist(profile, view.created)],
    themes: [],
    has_own_playlist: false,
    trial_days: view.trialDays,
    parent_pin: view.created ? '' : '0000',
    ip_address: view.ipAddress,
    notification: EMPTY_NOTIFICATION,
    languages: [],
  };
  const tail = {
    device_key: deviceKey(view),
    is_trial: legacyIsTrial(device),
    expire_date: legacyExpireDate(device),
    stalker_enabled: false,
  };
  // ibo sent mac_address to existing devices only.
  return view.created ? { ...head, ...tail } : { ...head, mac_address: device.macAddress, ...tail };
}

export interface AppDeviceView extends LegacyDeviceView {
  id: string;
  createdAt: Date;
}

function appDevice(device: AppDeviceView): Record<string, unknown> {
  return {
    id: device.id,
    mac: device.macAddress,
    payed: device.isPaid,
    free_trial: device.isPaid ? 0 : 1, // old Roku/iOS: 1 = on trial, 0 = paid
    free_trial_expired: legacyAccessEnd(device).toISOString(),
    key: device.deviceKey,
    createdAt: device.createdAt.toISOString(),
  };
}

/** Roku `device_login` (with playlists) and iOS/Android v2-v3 `device_login` (without). */
export function appLoginBody(input: {
  token: string;
  device: AppDeviceView;
  withPlaylists: boolean;
}): Record<string, unknown> {
  return {
    error: false,
    message: input.token,
    message2: {
      token: input.token,
      device: appDevice(input.device),
      ...(input.withPlaylists ? { playlists: [] } : {}), // playlists module (PL) not built yet
    },
    status: 200,
  };
}

/** Roku `register_device`: like device_login, but `message` is the object itself. */
export function registerDeviceBody(input: {
  token: string;
  device: AppDeviceView;
}): Record<string, unknown> {
  return {
    error: false,
    message: { token: input.token, device: appDevice(input.device), playlists: [] },
    status: 200,
  };
}
