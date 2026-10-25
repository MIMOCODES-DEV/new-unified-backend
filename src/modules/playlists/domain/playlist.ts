export const PLAYLIST_TYPES = ['m3u', 'xtream', 'stalker', 'code'] as const;
export type PlaylistType = (typeof PLAYLIST_TYPES)[number];

export const ADDED_VIA = ['app', 'website', 'store', 'admin'] as const;
export type AddedVia = (typeof ADDED_VIA)[number];

/** cr Android apps fall back to these when the playlist's host is down. */
export const MAX_BACKUP_HOSTS = 8;

/** Parsed once when an Xtream link is saved. Stored as is, not encrypted. */
export interface XtreamLogin {
  readonly server: string;
  readonly username: string;
  readonly password: string;
}

export interface StalkerPortal {
  readonly portalName: string | null;
  readonly portalUrl: string;
  readonly fallbackUrl: string | null;
  readonly mac: string | null;
}

/** A provider code (digits) typed instead of a link; CRPlayer reports expiresAt and status back. */
export interface ProviderCode {
  readonly code: string;
  readonly expiresAt: Date | null;
  readonly status: string | null;
}

/** Hosts that replace the host of url when it is down; kept when turned off. */
export interface PlaylistBackup {
  readonly enabled: boolean;
  readonly hosts: readonly string[];
}

/** The IPTV provider shown in the app. */
export interface PlaylistProvider {
  readonly name: string | null;
  readonly logo: string | null;
  readonly whatsapp: string | null;
  readonly email: string | null;
}

export interface AddedBy {
  readonly via: AddedVia;
  /** Never the raw API key. */
  readonly resellerId: string | null;
}

/**
 * One playlist of one device. `type` says which part is filled: url (m3u), url + xtream (xtream),
 * stalker, or code; the others are empty. deviceId never changes when the device pays.
 */
export interface Playlist {
  readonly id: string;
  readonly deviceId: string;
  readonly name: string;
  readonly type: PlaylistType;
  /** m3u and xtream: the link exactly as typed. */
  readonly url: string | null;
  readonly xtream: XtreamLogin | null;
  readonly stalker: StalkerPortal | null;
  readonly code: ProviderCode | null;
  readonly epgUrl: string | null;
  readonly backup: PlaylistBackup;
  /** Opening it needs the PIN. */
  readonly protected: boolean;
  /** Encrypted, not hashed: Roku and iOS replies send the PIN to the app. */
  readonly pinEnc: string | null;
  readonly provider: PlaylistProvider | null;
  readonly addedBy: AddedBy;
  readonly legacy: {
    readonly id?: string;
    readonly brand?: string;
    readonly [field: string]: unknown;
  } | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
