/** What a playlist move did. */
export interface MovedPlaylists {
  readonly moved: number;
  readonly renamed: number;
  readonly dropped: number;
}

/**
 * What licensing needs from the playlists module, bound at the process root
 * (src/module-settings.ts): a module may not import another module.
 */
export abstract class LicensedPlaylists {
  /** Gives every playlist of one device to another (names kept unique, duplicates dropped). */
  abstract moveAll(fromDeviceId: string, toDeviceId: string): Promise<MovedPlaylists>;
  /** Removes every playlist of a device (recovery, cleanup); returns how many. */
  abstract deleteAll(deviceId: string): Promise<number>;
}
