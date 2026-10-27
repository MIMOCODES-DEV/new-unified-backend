import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { Playlist } from './playlist.js';
import { InvalidPlaylistError } from './playlist.errors.js';

/** A provider's host as typed for a move: `line.example.com` or `line.example.com:8080`. */
export interface ProviderHost {
  /** Lower case, no scheme, no path. */
  readonly host: string;
  /** Only when typed: then only links on that port match, and the new link gets it. */
  readonly port: string | null;
}

const HOST = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * PL-8: a host for a provider move, read as plain text, never as a pattern. A scheme or path typed
 * with it is refused rather than guessed at.
 */
export function providerHost(
  value: string,
  field: string,
): Result<ProviderHost, InvalidPlaylistError> {
  const text = value.trim().toLowerCase().replace(/\.+$/, '');
  const [host = '', port = null, ...rest] = text.split(':');
  const validPort = port === null || (/^\d{1,5}$/.test(port) && Number(port) <= 65535);
  if (rest.length > 0 || !HOST.test(host) || !validPort) {
    return err(
      new InvalidPlaylistError('Give a host such as line.example.com or line.example.com:8080', {
        field,
      }),
    );
  }
  return ok({ host, port });
}

/** The link with its host moved, or null when it is not on `from`. */
function moveLink(link: string | null, from: ProviderHost, to: ProviderHost): string | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.hostname !== from.host) return null;
  if (from.port !== null && url.port !== from.port) return null;
  url.hostname = to.host;
  if (to.port !== null) url.port = to.port;
  let moved = url.toString();
  // URL adds a slash to a bare host; keep the link as it was typed.
  if (!link.endsWith('/') && moved.endsWith('/') && url.pathname === '/')
    moved = moved.slice(0, -1);
  return moved;
}

/**
 * The playlist with every link on `from` moved to `to` (the link, the Xtream server, the Stalker
 * portal and its fallback); path, login and port stay. Null when nothing in it is on `from`.
 */
export function moveProviderHost(
  playlist: Playlist,
  from: ProviderHost,
  to: ProviderHost,
): Playlist | null {
  const url = moveLink(playlist.url, from, to);
  const server = moveLink(playlist.xtream?.server ?? null, from, to);
  const portal = moveLink(playlist.stalker?.portalUrl ?? null, from, to);
  const fallback = moveLink(playlist.stalker?.fallbackUrl ?? null, from, to);
  if (!url && !server && !portal && !fallback) return null;
  return {
    ...playlist,
    url: url ?? playlist.url,
    xtream: playlist.xtream && { ...playlist.xtream, server: server ?? playlist.xtream.server },
    stalker: playlist.stalker && {
      ...playlist.stalker,
      portalUrl: portal ?? playlist.stalker.portalUrl,
      fallbackUrl: fallback ?? playlist.stalker.fallbackUrl,
    },
  };
}
