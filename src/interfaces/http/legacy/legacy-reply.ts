/**
 * Translates the new device, license and playlists into the fields the old apps read. The only
 * place the old numbers and names live.
 * - is_trial: trial 0 · revoked 1 · lifetime 2 · yearly 3 (an expired one keeps its number; the
 *   apps compare expire_date with today).
 * - expire_date: "YYYY-MM-DD" (UTC). Lifetime has no date: the far date the old backends sent.
 *   Revoked: yesterday, so the apps see it ended.
 * - A store-review build is answered as lifetime (DEV-6), as the old review override did.
 */
import type { Platform } from '../../../modules/devices/index.js';
import type { DeviceLicenseOutput } from '../../../modules/licensing/index.js';
import type { PlaylistReply } from '../../../modules/playlists/index.js';

export const LIFETIME_EXPIRE_DATE = '2438-11-01';

const day = (date: Date) => date.toISOString().slice(0, 10);

export function legacyLicense(
  license: DeviceLicenseOutput,
  reviewBuild: boolean,
  now: Date,
): { is_trial: 0 | 1 | 2 | 3; expire_date: string } {
  if (reviewBuild) return { is_trial: 2, expire_date: LIFETIME_EXPIRE_DATE };
  if (license.state === 'revoked') {
    return { is_trial: 1, expire_date: day(new Date(now.getTime() - 24 * 60 * 60 * 1000)) };
  }
  if (!license.license) {
    return { is_trial: 0, expire_date: license.endsAt ? day(license.endsAt) : day(now) };
  }
  if (license.license.type === 'lifetime')
    return { is_trial: 2, expire_date: LIFETIME_EXPIRE_DATE };
  return { is_trial: 3, expire_date: license.endsAt ? day(license.endsAt) : day(now) };
}

/**
 * Old apps read urls[0] at start-up and crash on an empty list; the old backends always sent at
 * least their demo playlist. When a device has no playlist and the brand no demo, this stands in.
 */
const PLACEHOLDER_PLAYLIST = {
  id: 'demo',
  playlist_name: 'Sample',
  playlist_type: 'general',
  url: '',
  username: '',
  password: '',
  origin_url: '',
  epg_url: '',
  is_protected: 0,
  code: '',
  portal_name: '',
  portal_address: '',
  portal_fallback_address: '',
  stalker_mac_address: '',
  logo: '',
  whatsapp: '',
  email: '',
  backup_urls: [] as string[],
};

/** The `urls` the old apps read: one entry per playlist, old field names; never empty. */
export function legacyUrls(reply: PlaylistReply) {
  if (reply.playlists.length === 0) return [PLACEHOLDER_PLAYLIST];
  return reply.playlists.map((p) => ({
    id: p.id ?? 'demo',
    playlist_name: p.name,
    playlist_type: p.type,
    url: p.url ?? '',
    username: p.username ?? '',
    password: p.password ?? '',
    origin_url: p.originUrl ?? p.url ?? '',
    epg_url: p.epgUrl ?? '',
    is_protected: p.protected ? 1 : 0,
    ...(p.pin !== undefined ? { pin: p.pin ?? '' } : {}),
    code: p.code ?? '',
    portal_name: p.stalker?.portalName ?? '',
    portal_address: p.stalker?.portalUrl ?? '',
    portal_fallback_address: p.stalker?.fallbackUrl ?? '',
    stalker_mac_address: p.stalker?.mac ?? '',
    logo: p.provider?.logo ?? '',
    whatsapp: p.provider?.whatsapp ?? '',
    email: p.provider?.email ?? '',
    backup_urls: [...p.backupUrls],
    // cr apps read the provider account status back (PL-7).
    ...(p.account
      ? {
          status: p.account.status ?? '',
          expiration_date: p.account.expiresAt ? day(p.account.expiresAt) : '',
        }
      : {}),
  }));
}

/** The app type in an old route's path (`/api/lg/v4/...`), as one of our platforms. */
const PATH_PLATFORMS: Record<string, Platform> = {
  android: 'android',
  android_tv: 'android_tv',
  samsung: 'samsung',
  lg: 'lg',
  vidaa: 'vidaa',
  zeasn: 'zeasn',
  // Philips TVs run Zeasn's Whale OS.
  philips: 'zeasn',
  titanos: 'titanos',
  vegaos: 'vegaos',
  windows: 'windows',
  macos: 'macos',
  linux: 'linux',
};

export function platformOfPath(appType: string): Platform | null {
  return PATH_PLATFORMS[appType.toLowerCase()] ?? null;
}
