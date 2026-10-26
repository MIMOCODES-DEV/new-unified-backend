import { MacAddress } from '../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../shared/kernel/result.js';
import type { Playlist } from './playlist.js';
import { InvalidPlaylistError } from './playlist.errors.js';
import { parseXtreamUrl, xtreamPlaylistUrl } from './xtream-url.js';

/** What a person typed to add a playlist, in one of the four forms the apps and website offer. */
export type PlaylistSource =
  /** A link: Xtream when it looks like one, otherwise M3U. */
  | { readonly kind: 'link'; readonly url: string }
  /** Xtream typed as three fields. */
  | {
      readonly kind: 'xtream';
      readonly server: string;
      readonly username: string;
      readonly password: string;
    }
  | {
      readonly kind: 'stalker';
      readonly portalUrl: string;
      readonly portalName?: string | null;
      readonly fallbackUrl?: string | null;
      readonly mac?: string | null;
    }
  /** A provider code (digits) instead of a link. */
  | { readonly kind: 'code'; readonly code: string };

/** The part of a playlist that depends on its type; only the part for the type is filled. */
export type PlaylistContent = Pick<Playlist, 'type' | 'url' | 'xtream' | 'stalker' | 'code'>;

const MAX_URL = 2048;
const MAX_NAME = 100;

const invalid = (field: string, message: string) =>
  err(new InvalidPlaylistError(message, { field }));

function httpUrl(value: string | null | undefined): string | null {
  const text = value?.trim();
  if (!text || text.length > MAX_URL) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'http:' || url.protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

const orNull = (value: string | null | undefined) => {
  const text = value?.trim();
  return text ? text : null;
};

/**
 * PL-1: turns what was typed into the stored playlist parts. An Xtream link is parsed once into
 * `xtream { server, username, password }` and `url` keeps the link exactly as typed. Nothing is
 * encrypted.
 */
export function playlistContent(
  source: PlaylistSource,
): Result<PlaylistContent, InvalidPlaylistError> {
  const empty = { url: null, xtream: null, stalker: null, code: null };
  switch (source.kind) {
    case 'link': {
      const url = httpUrl(source.url);
      if (!url) return invalid('url', 'The playlist link must be an http or https URL');
      const xtream = parseXtreamUrl(url);
      return ok(
        xtream ? { ...empty, type: 'xtream', url, xtream } : { ...empty, type: 'm3u', url },
      );
    }
    case 'xtream': {
      const server = httpUrl(source.server);
      if (!server) return invalid('server', 'The Xtream server must be an http or https URL');
      if (!source.username.trim()) return invalid('username', 'The Xtream username is required');
      if (!source.password) return invalid('password', 'The Xtream password is required');
      const xtream = {
        server: server.endsWith('/') ? server : `${server}/`,
        username: source.username.trim(),
        password: source.password,
      };
      return ok({ ...empty, type: 'xtream', url: xtreamPlaylistUrl(xtream), xtream });
    }
    case 'stalker': {
      const portalUrl = httpUrl(source.portalUrl);
      if (!portalUrl) return invalid('portalUrl', 'The portal must be an http or https URL');
      const fallbackText = orNull(source.fallbackUrl);
      const fallbackUrl = fallbackText ? httpUrl(fallbackText) : null;
      if (fallbackText && !fallbackUrl) {
        return invalid('fallbackUrl', 'The fallback portal must be an http or https URL');
      }
      const macText = orNull(source.mac);
      const mac = macText ? MacAddress.parse(macText) : null;
      if (mac && !mac.ok) return invalid('mac', 'The portal MAC address is not valid');
      return ok({
        ...empty,
        type: 'stalker',
        stalker: {
          portalName: orNull(source.portalName),
          portalUrl,
          fallbackUrl,
          mac: mac?.ok ? mac.value.value : null,
        },
      });
    }
    case 'code': {
      const code = source.code.trim();
      if (!/^\d{1,32}$/.test(code)) return invalid('code', 'A playlist code is digits only');
      return ok({ ...empty, type: 'code', code: { code, expiresAt: null, status: null } });
    }
  }
}

/** A playlist name: trimmed, 1 to 100 characters. */
export function playlistName(name: string): Result<string, InvalidPlaylistError> {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME) {
    return invalid('name', 'A playlist name is 1 to 100 characters');
  }
  return ok(trimmed);
}

/** An optional EPG link: http or https, or nothing. */
export function epgUrl(
  value: string | null | undefined,
): Result<string | null, InvalidPlaylistError> {
  const text = orNull(value);
  if (!text) return ok(null);
  const url = httpUrl(text);
  return url ? ok(url) : invalid('epgUrl', 'The EPG link must be an http or https URL');
}
