import { backupUrls } from './backup-hosts.js';
import type { Playlist, PlaylistAccount, PlaylistProvider, StalkerPortal } from './playlist.js';
import { playlistContent } from './playlist-content.js';
import { xtreamPlaylistUrl } from './xtream-url.js';

/**
 * How the apps get a playlist link (PL-4):
 * - `xc`: an Xtream playlist as server + username + password (brand `playlistProfile` xc);
 * - `general`: an Xtream playlist as one get.php link (brand `playlistProfile` general);
 * - `raw`: every link exactly as typed (Android 4.4 builds, when the brand turns it on).
 */
export type ReplyProfile = 'xc' | 'general' | 'raw';

/** The playlist as the apps receive it; each route renames the fields to its own format. */
export interface PlaylistReplyItem {
  /** null for the demo playlist. */
  readonly id: string | null;
  readonly name: string;
  /** `general` = one link in url; `xc` = server in url plus username and password. */
  readonly type: 'general' | 'xc' | 'stalker' | 'code';
  readonly url: string | null;
  readonly username: string | null;
  readonly password: string | null;
  /** The link as the person typed it. */
  readonly originUrl: string | null;
  readonly epgUrl: string | null;
  readonly protected: boolean;
  readonly stalker: StalkerPortal | null;
  readonly code: string | null;
  readonly provider: PlaylistProvider | null;
  /** The account status the app last reported (cr sends it back as status / expiration_date). */
  readonly account: PlaylistAccount | null;
  /** cr's `backup_urls`: the link with its host swapped for each backup; empty when turned off. */
  readonly backupUrls: readonly string[];
  readonly demo: boolean;
}

const LINK_ONLY = { username: null, password: null, stalker: null, code: null };

/** One stored playlist in the reply profile, with its backup links. The PIN is never part of it. */
export function shapePlaylist(playlist: Playlist, profile: ReplyProfile): PlaylistReplyItem {
  const item = shapeLinks(playlist, profile);
  const hosts = playlist.backup.enabled ? playlist.backup.hosts : [];
  return { ...item, backupUrls: backupUrls(item.url, hosts) };
}

function shapeLinks(
  playlist: Playlist,
  profile: ReplyProfile,
): Omit<PlaylistReplyItem, 'backupUrls'> {
  const common = {
    id: playlist.id,
    name: playlist.name,
    originUrl: playlist.url,
    epgUrl: playlist.epgUrl,
    protected: playlist.protected,
    provider: playlist.provider,
    account: playlist.account,
    demo: false,
  };
  switch (playlist.type) {
    case 'xtream': {
      const xtream = playlist.xtream!;
      if (profile === 'xc') {
        return {
          ...common,
          type: 'xc',
          url: xtream.server,
          username: xtream.username,
          password: xtream.password,
          stalker: null,
          code: null,
        };
      }
      const url = profile === 'raw' ? playlist.url : xtreamPlaylistUrl(xtream);
      return { ...common, ...LINK_ONLY, type: 'general', url };
    }
    case 'm3u':
      return { ...common, ...LINK_ONLY, type: 'general', url: playlist.url };
    case 'stalker':
      return { ...common, ...LINK_ONLY, type: 'stalker', url: null, stalker: playlist.stalker };
    case 'code':
      return { ...common, ...LINK_ONLY, type: 'code', url: null, code: playlist.code!.code };
  }
}

/** The brand's demo playlist (`app.demoUrl`), in the reply profile; null when the link is not usable. */
export function demoPlaylist(demoUrl: string, profile: ReplyProfile): PlaylistReplyItem | null {
  const content = playlistContent({ kind: 'link', url: demoUrl });
  if (!content.ok) return null;
  const at = new Date(0);
  const shaped = shapePlaylist(
    {
      id: 'demo',
      deviceId: '',
      name: 'Demo',
      ...content.value,
      account: null,
      epgUrl: null,
      backup: { enabled: false, hosts: [] },
      protected: false,
      pinEnc: null,
      provider: null,
      addedBy: { via: 'admin', resellerId: null },
      legacy: null,
      createdAt: at,
      updatedAt: at,
    },
    profile,
  );
  return { ...shaped, id: null, demo: true };
}
