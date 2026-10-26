import { DomainError } from '../../../shared/kernel/domain-error.js';

/** The playlist sent is not valid; `details.field` names the part that is wrong. */
export class InvalidPlaylistError extends DomainError {
  readonly code = 'playlists.invalid_playlist';
}

export class PlaylistNotFoundError extends DomainError {
  readonly code = 'playlists.not_found';
}
