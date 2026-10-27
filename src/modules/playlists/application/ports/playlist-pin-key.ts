/**
 * The brand's key for playlist PINs: the brand secret `playlists.pinKey` (32 random bytes, base64),
 * bound at the process root (src/module-settings.ts). Null when the brand has none yet; create it
 * with `pnpm cli playlists:pin-keys`.
 */
export abstract class PlaylistPinKey {
  abstract current(): Promise<string | null>;
}

/** The brand secret that holds the key. */
export const PLAYLIST_PIN_KEY_SECRET = 'playlists.pinKey';
