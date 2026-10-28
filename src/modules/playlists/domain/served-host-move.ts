import type { Playlist } from './playlist.js';

/** An approved provider move, as playlist replies apply it. */
export interface ServedHostMove {
  /** Lowercase host[:port], the port only when it is not the scheme's default. */
  readonly fromHost: string;
  readonly toHost: string;
  /** The scheme the new host is reached on; empty keeps the link's own. */
  readonly toScheme: 'http' | 'https' | '';
}

/** The link on the move's new host, or null when it is not on any move's old host. */
function movedLink(
  link: string | null,
  moves: readonly ServedHostMove[],
): { link: string; oldHost: string } | null {
  if (!link) return null;
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  const move = moves.find((m) => m.fromHost === url.host);
  if (!move) return null;
  const scheme = url.protocol.replace(/:$/, '');
  const port = url.port || (scheme === 'https' ? '443' : '80');
  const oldHost = `${scheme}://${url.hostname}:${port}`;
  if (move.toScheme) url.protocol = `${move.toScheme}:`;
  url.host = move.toHost;
  let moved = url.toString();
  // URL adds a slash to a bare host; keep the link as it was typed.
  if (!link.endsWith('/') && moved.endsWith('/') && url.pathname === '/')
    moved = moved.slice(0, -1);
  return { link: moved, oldHost };
}

/**
 * DOM-2: the playlist as a reply sends it when its provider moved and staff approved the move: the
 * link (or Xtream server) on the new host, path and login unchanged. The old host is kept as the
 * first backup, so an app that cannot reach the new host still tries the old one. Only M3U and
 * Xtream links move (the kinds a move is learned from). The stored playlist is never changed; the
 * same playlist is returned when no approved move applies.
 */
export function withServedHostMoves(
  playlist: Playlist,
  moves: readonly ServedHostMove[],
): Playlist {
  if (moves.length === 0 || (playlist.type !== 'm3u' && playlist.type !== 'xtream')) {
    return playlist;
  }
  const url = movedLink(playlist.url, moves);
  const server = movedLink(playlist.xtream?.server ?? null, moves);
  const moved = url ?? server;
  if (!moved) return playlist;
  const ownBackups = playlist.backup.enabled ? playlist.backup.hosts : [];
  return {
    ...playlist,
    url: url?.link ?? playlist.url,
    xtream: playlist.xtream && {
      ...playlist.xtream,
      server: server?.link ?? playlist.xtream.server,
    },
    backup: { enabled: true, hosts: [moved.oldHost, ...ownBackups] },
  };
}
