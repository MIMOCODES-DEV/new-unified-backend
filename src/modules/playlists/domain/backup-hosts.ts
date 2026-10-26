import { err, ok, type Result } from '../../../shared/kernel/result.js';
import { MAX_BACKUP_HOSTS } from './playlist.js';
import { InvalidPlaylistError } from './playlist.errors.js';

/** A mirror of the playlist's server: a host, and the scheme or port when they differ. */
interface BackupEntry {
  readonly scheme: 'http' | 'https' | null;
  readonly host: string;
  readonly port: string | null;
}

// A host name or IPv4 with at least one dot: a bare label is a typo, not a mirror.
const HOST = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/;

/**
 * What a person typed as a backup, as the old cr backend read it: `line.x.com`,
 * `line.x.com:8080`, `https://line.x.com`, or a whole pasted link (only its host is kept).
 * Null when it is not a usable host.
 */
function parseBackupEntry(value: string): BackupEntry | null {
  let raw = value.trim();
  let scheme: BackupEntry['scheme'] = null;
  const matched = /^([a-z][a-z0-9+.-]*):\/\//i.exec(raw);
  if (matched) {
    const name = matched[1]!.toLowerCase();
    if (name !== 'http' && name !== 'https') return null;
    scheme = name;
    raw = raw.slice(matched[0].length);
  }
  raw = raw.split(/[/?#]/)[0]!;
  raw = raw.slice(raw.lastIndexOf('@') + 1).replace(/\.+$/, '');

  let host = raw.toLowerCase();
  let port: string | null = null;
  const colon = host.lastIndexOf(':');
  if (colon !== -1) {
    port = host.slice(colon + 1);
    host = host.slice(0, colon);
    if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) return null;
  }
  return HOST.test(host) ? { scheme, host, port } : null;
}

const show = (e: BackupEntry) =>
  `${e.scheme ? `${e.scheme}://` : ''}${e.host}${e.port ? `:${e.port}` : ''}`;

/**
 * PL-5: the backup hosts to store: each one checked, written the same way (`line.x.com`,
 * `https://line.x.com:8080`), duplicates dropped, at most 8.
 */
export function backupHosts(values: readonly string[]): Result<string[], InvalidPlaylistError> {
  const hosts: string[] = [];
  for (const [index, value] of values.entries()) {
    if (!value.trim()) continue;
    const entry = parseBackupEntry(value);
    if (!entry) {
      return err(
        new InvalidPlaylistError('A backup must be a host such as line.example.com', {
          field: 'backup.hosts',
          index,
        }),
      );
    }
    const host = show(entry);
    if (!hosts.includes(host)) hosts.push(host);
  }
  if (hosts.length > MAX_BACKUP_HOSTS) {
    return err(
      new InvalidPlaylistError(`At most ${MAX_BACKUP_HOSTS} backup hosts`, {
        field: 'backup.hosts',
      }),
    );
  }
  return ok(hosts);
}

/**
 * The links the app tries when the playlist's server is down, as cr builds `backup_urls`: the
 * reply's own link with only its host swapped. Path, query and login stay; a backup that names a
 * scheme or port uses it, otherwise the link's own is kept.
 */
export function backupUrls(url: string | null, hosts: readonly string[]): string[] {
  if (!url) return [];
  let primary: URL;
  try {
    primary = new URL(url);
  } catch {
    return [];
  }
  const keepsSlash = primary.pathname !== '/' || url.endsWith('/');
  const urls: string[] = [];
  for (const value of hosts) {
    const entry = parseBackupEntry(value);
    if (!entry) continue;
    const candidate = new URL(primary.toString());
    if (entry.scheme) candidate.protocol = `${entry.scheme}:`;
    candidate.hostname = entry.host;
    candidate.port = entry.port ?? primary.port;
    let built = candidate.toString();
    if (!keepsSlash) built = built.replace(/\/$/, '');
    if (built !== url && !urls.includes(built)) urls.push(built);
  }
  return urls;
}
