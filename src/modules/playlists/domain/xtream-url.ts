import type { XtreamLogin } from './playlist.js';

/** Paths the old backends recognised as an Xtream playlist link, longest first. */
const XTREAM_PATHS = ['/get.php', '/play/list', '/playlist'];

/**
 * The Xtream login inside a playlist link, or null for a plain M3U link. A link is Xtream when its
 * path ends with `/get.php`, `/play/list` or `/playlist` and it has `username` and `password`
 * (any case), as in the old backends. `server` is everything before that path, with a trailing
 * slash (`http://host:8080/`), the shape the apps get today.
 */
export function parseXtreamUrl(link: string): XtreamLogin | null {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const path = url.pathname.replace(/\/+$/, '');
  const marker = XTREAM_PATHS.find((p) => path.toLowerCase().endsWith(p));
  if (!marker) return null;

  let username: string | null = null;
  let password: string | null = null;
  for (const [key, value] of url.searchParams) {
    if (key.toLowerCase() === 'username') username = value;
    if (key.toLowerCase() === 'password') password = value;
  }
  if (!username || !password) return null;

  const prefix = path.slice(0, path.length - marker.length);
  return { server: `${url.origin}${prefix}/`, username, password };
}

/** The `get.php` link for an Xtream login, as the old backends rebuilt it for M3U-only apps. */
export function xtreamPlaylistUrl(login: XtreamLogin): string {
  const query = new URLSearchParams({
    username: login.username,
    password: login.password,
    type: 'm3u_plus',
    output: 'ts',
  });
  return `${login.server.replace(/\/+$/, '')}/get.php?${query.toString()}`;
}
