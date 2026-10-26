import { DomainError } from '../../../shared/kernel/domain-error.js';

/** The playlist sent is not valid; `details.field` names the part that is wrong. */
export class InvalidPlaylistError extends DomainError {
  readonly code = 'playlists.invalid_playlist';
}

/** No such playlist on the calling device (it may belong to another device). */
export class PlaylistNotFoundError extends DomainError {
  readonly code = 'playlists.not_found';
}

/** The device already has this playlist: same link, Xtream login, portal or code. */
export class PlaylistExistsError extends DomainError {
  readonly code = 'playlists.exists';
}

/** No device with this MAC in the brand. */
export class PlaylistDeviceNotFoundError extends DomainError {
  readonly code = 'playlists.device_not_found';
}
