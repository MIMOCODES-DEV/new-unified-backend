import { Injectable } from '@nestjs/common';
import {
  demoPlaylist,
  type PlaylistReplyItem,
  type ReplyProfile,
  shapePlaylist,
} from '../../domain/playlist-reply.js';
import { PlaylistPins } from '../playlist-pins.js';
import { withServedHostMoves } from '../../domain/served-host-move.js';
import { PlaylistBrand } from '../ports/playlist-brand.js';
import { PlaylistHostMoves } from '../ports/playlist-host-moves.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';

export interface PlaylistReplyInput {
  deviceId: string;
  platform: string;
  appVersion: string | null;
  /** The device shows Stalker portals; when off, the app hides them. */
  stalkerEnabled: boolean;
  /** Roku and iOS replies send each playlist's PIN so the app can check it. */
  includePins: boolean;
}

export interface PlaylistReply {
  /** False when the device has no playlist of its own (the old `has_own_playlist`). */
  hasOwnPlaylist: boolean;
  playlists: (PlaylistReplyItem & { pin?: string | null })[];
}

/**
 * PL-4: a device's playlists as the apps receive them.
 * - Links follow the brand's `playlistProfile` (xc or general); Android builds whose version starts
 *   with `44` get them exactly as typed when the brand turns `rawPlaylistsForAndroid44` on.
 * - A device with no playlist gets the brand's demo playlist; so does one whose playlists are all
 *   Stalker portals while Stalker is off, because the app would show nothing.
 * - The PIN is only included when asked (Roku, iOS).
 * - A link on a provider host that moved, with the move approved by staff, goes out on the new host,
 *   with the old one as its first backup (DOM-2); the stored playlist stays as it is.
 */
@Injectable()
export class PlaylistReplyUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly brand: PlaylistBrand,
    private readonly pins: PlaylistPins,
    private readonly hostMoves: PlaylistHostMoves,
  ) {}

  async execute(input: PlaylistReplyInput): Promise<PlaylistReply> {
    const profile = await this.profile(input);
    const own = await this.playlists.listByDevice(input.deviceId);
    const moves = own.length > 0 ? await this.hostMoves.approved() : [];

    const shaped: PlaylistReply['playlists'] = [];
    for (const playlist of own) {
      const item = shapePlaylist(withServedHostMoves(playlist, moves), profile);
      shaped.push(input.includePins ? { ...item, pin: await this.pins.reveal(playlist) } : item);
    }

    const visible = input.stalkerEnabled ? own : own.filter((p) => p.type !== 'stalker');
    if (visible.length === 0) {
      const demoUrl = await this.brand.demoUrl();
      const demo = demoUrl ? demoPlaylist(demoUrl, profile) : null;
      if (demo) shaped.push(demo);
    }
    return { hasOwnPlaylist: own.length > 0, playlists: shaped };
  }

  private async profile(input: PlaylistReplyInput): Promise<ReplyProfile> {
    const isAndroid44 =
      input.platform.startsWith('android') && (input.appVersion ?? '').trim().startsWith('44');
    if (isAndroid44 && (await this.brand.rawForAndroid44())) return 'raw';
    return this.brand.replyProfile();
  }
}
