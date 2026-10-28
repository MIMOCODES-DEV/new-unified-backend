/**
 * The device-info replies of the old (pre-V4) app routes, per old backend (`legacy.dialect`).
 * The same route answered with different fields on ibo, bob and cr; the apps of each brand read
 * their own backend's. Values come from the new device, license and playlists, translated by
 * legacy-reply.ts; only the field sets differ here.
 * - TV `playlist_info` family: `tvInfo`; cr's CRPlayer route: `crTvV4Info`; cr's smart TV
 *   `device_info`: `smartTvInfo`.
 * - Roku and the old iOS/Android apps: `rokuDevice`, `rokuItems`, `mobileItems`.
 * Not built yet (later phases): themes and languages (content) are empty, the Android update
 * fields carry no update.
 */
import type { DeviceLicenseOutput } from '../../../modules/licensing/index.js';
import type { PlaylistReply } from '../../../modules/playlists/index.js';
import type { LegacyDialect, TenantSettings } from '../../../shared/kernel/tenant-settings.js';
import { legacyLicense, legacyPlaylist, legacyUrls, notificationFields } from './legacy-reply.js';

/** The device fields these replies read. */
export interface LegacyInfoDevice {
  id: string;
  macAddress: string;
  deviceKey: string;
  uid: string | null;
  parentPin: string | null;
  stalkerEnabled: boolean;
  createdAt: Date;
}

export interface LegacyDeviceInfo {
  device: LegacyInfoDevice;
  /** This call made the device: the old replies sent its key as a number then. */
  created: boolean;
  reviewBuild: boolean;
  license: DeviceLicenseOutput;
  playlists: PlaylistReply;
  trialDays: number;
  ip: string;
  now: Date;
}

/** Which app family a TV-route call came from, by its `app_type` (ibo answered each its own way). */
export type AppFamily = 'tv' | 'android' | 'ios';

const ANDROID_TYPES = new Set(['android', 'android_tv', 'fire_tv']);
const IOS_TYPES = new Set(['ios', 'macos', 'tvos']);

export function appFamily(appType: string): AppFamily {
  const type = appType.toLowerCase();
  if (ANDROID_TYPES.has(type)) return 'android';
  return IOS_TYPES.has(type) ? 'ios' : 'tv';
}

type Item = ReturnType<typeof legacyUrls>[number];

/** The listed fields of an item that it has, in that order. */
function pick(item: Item, keys: readonly string[]): Record<string, unknown> {
  const source = item as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of keys) if (source[key] !== undefined) out[key] = source[key];
  return out;
}

const BASE_ITEM = [
  'is_protected',
  'id',
  'url',
  'playlist_name',
  'username',
  'password',
  'epg_url',
  'playlist_type',
] as const;
const PORTAL = [
  'portal_name',
  'portal_address',
  'portal_fallback_address',
  'stalker_mac_address',
] as const;
const ORIGIN = ['origin_type', 'origin_url'] as const;

const ITEM_FIELDS: Record<LegacyDialect | 'iboApp', readonly string[]> = {
  ibo: [...BASE_ITEM, ...PORTAL, ...ORIGIN],
  // ibo's Android and iOS branches left the portal fields out.
  iboApp: [...BASE_ITEM, ...ORIGIN],
  bob: [...BASE_ITEM, ...ORIGIN],
  cr: [...BASE_ITEM, 'code', 'status', 'expiration_date', ...ORIGIN, 'backup_urls'],
};

function tvUrls(playlists: PlaylistReply, fields: readonly string[], crPortals: boolean) {
  return legacyUrls(playlists).map((item) => {
    const picked = pick(item, fields);
    // cr's playlist_info named the fallback portal `fallback_portal_address`, for stalker only.
    if (crPortals && item.playlist_type === 'stalker') {
      picked.portal_name = item.portal_name;
      picked.portal_address = item.portal_address;
      picked.fallback_portal_address = item.portal_fallback_address;
      picked.stalker_mac_address = item.stalker_mac_address;
    }
    return picked;
  });
}

/** The device key: a number when this call made the device, text after (as the old replies). */
const deviceKey = (info: LegacyDeviceInfo): string | number =>
  info.created ? Number(info.device.deviceKey) : info.device.deviceKey;

/** No Android app update offered: the update screen compares version codes (content phase). */
const NO_ANDROID_UPDATE = { android_version_code: '0', apk_url: '' };

/**
 * The TV `playlist_info` family (`playlist_info`, `playlist_information`, the signed v2/v3
 * routes): what the brand's old backend sent for this app family.
 */
export function tvInfo(
  dialect: LegacyDialect,
  info: LegacyDeviceInfo,
  family: AppFamily,
  legacy: TenantSettings['legacy'],
): Record<string, unknown> {
  const license = legacyLicense(info.license, info.reviewBuild, info.now);
  const mac = info.device.macAddress;
  if (dialect === 'bob') {
    return {
      has_own_playlist: info.playlists.hasOwnPlaylist,
      real_time_notification: '0',
      notification_interval: legacy.notificationInterval,
      ...(family === 'android' ? NO_ANDROID_UPDATE : {}),
      mac_registered: !info.created,
      urls: tvUrls(info.playlists, ITEM_FIELDS.bob, false),
      ip_address: info.ip,
      trial_days: String(info.trialDays),
      device_key: deviceKey(info),
      ...license,
      mac_address: mac,
      status: 'success',
      is_expired: false,
      notification: { title: '', content: '' },
      languages: [],
    };
  }
  if (dialect === 'cr') {
    return {
      has_own_playlist: info.playlists.hasOwnPlaylist,
      ...(family === 'android' ? NO_ANDROID_UPDATE : {}),
      mac_registered: !info.created,
      ip_address: info.ip,
      urls: tvUrls(info.playlists, ITEM_FIELDS.cr, true),
      themes: [],
      notifications: [],
      trial_days: info.trialDays,
      device_key: deviceKey(info),
      ...license,
      status: 'success',
      is_expired: false,
      languages: [],
    };
  }
  const fields = family === 'tv' ? ITEM_FIELDS.ibo : ITEM_FIELDS.iboApp;
  return {
    mac_registered: !info.created,
    urls: tvUrls(info.playlists, fields, false),
    themes: [],
    has_own_playlist: info.playlists.hasOwnPlaylist,
    trial_days: info.trialDays,
    parent_pin: info.created ? '' : (info.device.parentPin ?? ''),
    ip_address: info.ip,
    ...notificationFields(legacy),
    languages: [],
    ...(family === 'android' ? NO_ANDROID_UPDATE : {}),
    mac_address: mac,
    device_key: deviceKey(info),
    ...(family === 'android' && info.created && info.device.uid ? { u_id: info.device.uid } : {}),
    ...license,
    stalker_enabled: info.device.stalkerEnabled,
  };
}

/** cr's CRPlayer TV route (`tv/v4/playlist_info`). */
export function crTvV4Info(info: LegacyDeviceInfo): Record<string, unknown> {
  return {
    has_own_playlist: info.playlists.hasOwnPlaylist,
    mac_registered: true,
    ip_address: info.ip,
    urls: tvUrls(info.playlists, ITEM_FIELDS.cr, false),
    themes: [],
    notifications: [],
    trial_days: info.trialDays,
    device_key: info.device.deviceKey,
    ...legacyLicense(info.license, info.reviewBuild, info.now),
    recovery_code_enabled: false,
    ...(info.device.parentPin ? { parent_pin: info.device.parentPin } : {}),
    apiVersion: 'v4',
    status: 'success',
    is_expired: false,
    languages: [],
  };
}

/** cr's smart TV route (`device_info`, by app device id). */
export function smartTvInfo(info: LegacyDeviceInfo): Record<string, unknown> {
  const playlists = info.playlists.playlists.filter((p) => !p.demo);
  const demo = { id: 'demo', name: 'Demo', url: '', type: 'general' };
  return {
    mac_registered: !info.created,
    urls: [],
    ...(info.created ? { lock: 0, pin_code: '0000' } : {}),
    logo: '',
    themes: [],
    youtube_api_key: '',
    adverts: [],
    trial_days: info.trialDays,
    version: '',
    subtitle_domain: '',
    subtitle_enabled: false,
    ...legacyLicense(info.license, info.reviewBuild, info.now),
    ...(info.created ? { youtube_playlists: [] } : {}),
    device_key: info.device.deviceKey,
    mac_address: info.device.macAddress,
    demo_url: demo,
    languages: [],
    playlists:
      playlists.length > 0
        ? playlists.map((p, index) => ({
            id: p.id,
            name: p.name || `PlayList ${index}`,
            url: p.url ?? '',
            password: p.password ?? '',
            backup_urls: [...p.backupUrls],
          }))
        : [demo],
  };
}

/** The ISO time of an old `YYYY-MM-DD` date (UTC midnight), as the Roku replies sent it. */
const isoDay = (day: string) => new Date(`${day}T00:00:00.000Z`).toISOString();

/**
 * The Roku and old mobile apps' device object. `payed` = a paid license that runs;
 * `free_trial` 1 otherwise (they read the dates themselves).
 */
export function rokuDevice(info: LegacyDeviceInfo, mac: string) {
  const license = legacyLicense(info.license, info.reviewBuild, info.now);
  const payed = isRunningPaid(info);
  return {
    id: info.device.id,
    mac,
    payed,
    free_trial: payed ? 0 : 1,
    free_trial_expired: isoDay(license.expire_date),
    key: info.device.deviceKey,
    createdAt: info.device.createdAt.toISOString(),
  };
}

/** `free_trial` as validate_status sent it: the paid type (2 lifetime, 3 yearly), 1 trial, 0 revoked. */
export function rokuTrialNumber(info: LegacyDeviceInfo): number {
  const { is_trial } = legacyLicense(info.license, info.reviewBuild, info.now);
  return is_trial === 0 ? 1 : is_trial === 1 ? 0 : is_trial;
}

/** A paid (or review) license that has not ended. */
export function isRunningPaid(info: LegacyDeviceInfo): boolean {
  return info.reviewBuild || (info.license.active && info.license.license !== null);
}

/** Whether the device may still use the app: the old "your free trial expired!" check. */
export function isRunning(info: LegacyDeviceInfo): boolean {
  return info.reviewBuild || info.license.active;
}

/** The device's own playlists (never the demo) in the Roku shape. */
export function rokuItems(info: LegacyDeviceInfo) {
  return ownPlaylists(info).map((item) => ({
    is_protected: item.is_protected,
    pin: item.pin ?? '',
    id: item.id,
    deviceId: info.device.id,
    url: item.url,
    name: item.playlist_name,
    username: item.username,
    password: item.password,
    epg_url: item.epg_url,
    categories: item.playlist_type,
    origin_url: item.origin_url,
  }));
}

/** The device's own playlists in the old iOS/Android shape. */
export function mobileItems(info: LegacyDeviceInfo) {
  return ownPlaylists(info).map((item) => ({
    is_protected: item.is_protected,
    pin: item.pin ?? '',
    id: item.id,
    deviceId: info.device.id,
    url: item.url,
    name: item.playlist_name,
    username: item.username,
    password: item.password,
    code: item.code,
    epg_url: item.epg_url,
    playlist_type: item.playlist_type,
    origin_type: item.origin_type,
    origin_url: item.origin_url,
  }));
}

function ownPlaylists(info: LegacyDeviceInfo) {
  return info.playlists.playlists.filter((p) => !p.demo).map(legacyPlaylist);
}
