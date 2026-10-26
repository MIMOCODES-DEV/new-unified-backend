/** Brand settings the playlist reply reads, bound at the process root (src/module-settings.ts). */
export abstract class PlaylistBrand {
  /** Brand setting `playlistProfile`: Xtream playlists as `xc` parts or one `general` link. */
  abstract replyProfile(): Promise<'xc' | 'general'>;
  /** Brand flag `features.rawPlaylistsForAndroid44`: Android 4.4 builds get links as typed. */
  abstract rawForAndroid44(): Promise<boolean>;
  /** Brand config `app.demoUrl`: the playlist a device without its own gets; null for none. */
  abstract demoUrl(): Promise<string | null>;
}
