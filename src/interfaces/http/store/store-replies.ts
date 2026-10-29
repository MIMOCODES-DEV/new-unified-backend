import type { FoundDevice } from '../../../modules/devices/index.js';
import type { DeviceLicenseOutput } from '../../../modules/licensing/index.js';
import type { Playlist } from '../../../modules/playlists/index.js';
import { legacyLicense } from '../legacy/legacy-reply.js';

/** The old backends' `Y-MM-DD HH:mm`, in UTC. */
const minute = (date: Date) => date.toISOString().slice(0, 16).replace('T', ' ');

/** The old `playlist_type` of each kind. */
const OLD_TYPE: Record<Playlist['type'], string> = {
  m3u: 'general',
  xtream: 'xc',
  stalker: 'stalker',
  code: 'code',
};

/** The kinds the store names with the old `playlist_type`; the new names work too. */
export const KIND_OF_OLD_TYPE: Record<string, Playlist['type']> = {
  general: 'm3u',
  m3u: 'm3u',
  xc: 'xtream',
  xtream: 'xtream',
  stalker: 'stalker',
  code: 'code',
};

/**
 * A device as the store read the old `Device` document. The ids are the old ones after the data
 * move (`legacy.id`), so the store's stored ids keep working.
 */
export function storeDevice(found: FoundDevice, license: DeviceLicenseOutput, now: Date) {
  const device = found.device;
  const { is_trial, expire_date } = legacyLicense(license, false, now);
  return {
    _id: device.legacy?.id ?? device.id,
    mac_address: device.macAddress,
    device_key: device.deviceKey,
    app_type: device.platform,
    is_trial,
    expire_date,
    multi_activate: license.license?.multiActivate ? 1 : 0,
    credit_count: license.license?.creditCost ?? 0,
    reseller_id: found.paid ? found.device.resellerId : null,
    parent_pin: device.parentPin ?? '',
    created_time: minute(device.createdAt),
  };
}

/** A playlist as the store read the old `PlayList` document. PINs are never sent back. */
export function storePlaylist(playlist: Playlist, device: FoundDevice['device']) {
  return {
    _id: playlist.legacy?.id ?? playlist.id,
    device_id: device.legacy?.id ?? device.id,
    playlist_name: playlist.name,
    playlist_type: OLD_TYPE[playlist.type],
    url: playlist.xtream?.server ?? playlist.url ?? '',
    username: playlist.xtream?.username ?? '',
    password: playlist.xtream?.password ?? '',
    epg_url: playlist.epgUrl ?? '',
    is_protected: playlist.protected ? 1 : 0,
    code: playlist.code?.code ?? '',
    portal_name: playlist.stalker?.portalName ?? '',
    portal_address: playlist.stalker?.portalUrl ?? '',
    fallback_portal_address: playlist.stalker?.fallbackUrl ?? '',
    stalker_mac_address: playlist.stalker?.mac ?? '',
    contact_name: playlist.provider?.name ?? null,
    logo: playlist.provider?.logo ?? null,
    whatsapp: playlist.provider?.whatsapp ?? null,
    email: playlist.provider?.email ?? null,
    backup_dns: [...playlist.backup.hosts],
    cross_dns_backup: playlist.backup.enabled ? 1 : 0,
  };
}
