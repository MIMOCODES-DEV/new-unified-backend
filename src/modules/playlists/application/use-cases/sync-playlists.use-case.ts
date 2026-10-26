import { Injectable } from '@nestjs/common';
import type { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { err, ok, type Result } from '../../../../shared/kernel/result.js';
import type { AddedBy, Playlist } from '../../domain/playlist.js';
import { playlistContent } from '../../domain/playlist-content.js';
import { PlaylistDeviceNotFoundError } from '../../domain/playlist.errors.js';
import { PlaylistDevices } from '../ports/playlist-devices.js';
import { PlaylistRepository } from '../ports/playlist.repository.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';
import { DeletePlaylistUseCase } from './delete-playlist.use-case.js';
import { EditPlaylistUseCase } from './edit-playlist.use-case.js';

export interface SyncItem {
  /** The id the app holds: a saved playlist's id, or its own temporary id (`non_saved_…`). */
  originId: string | null;
  name: string;
  url: string;
}

export interface SyncPlaylistsInput {
  mac: MacAddress;
  playlists: readonly SyncItem[];
  removeIds: readonly string[];
  addedBy: AddedBy;
}

/** One line per item sent: the saved id next to the app's id, or why it was not saved. */
export interface SyncedPlaylist {
  originId: string | null;
  id: string | null;
  name: string;
  url: string;
  /** An error code (`playlists.invalid_playlist`, …) when this item was not saved. */
  error: string | null;
}

/**
 * PL-2, the apps' bulk sync (old `update_playlist`): for the device with this MAC,
 * - an item whose id is one of its playlists changes that playlist (name and link);
 * - any other item is added, and its new id is returned next to the app's id; an item the device
 *   already has returns the existing id, so sending the same list again changes nothing;
 * - `removeIds` are deleted.
 * Only the calling device's playlists are ever touched: another device's id is treated as new
 * (to add) or ignored (to remove). The old code changed and deleted any playlist by id.
 */
@Injectable()
export class SyncPlaylistsUseCase {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly devices: PlaylistDevices,
    private readonly add: AddPlaylistUseCase,
    private readonly edit: EditPlaylistUseCase,
    private readonly remove: DeletePlaylistUseCase,
  ) {}

  async execute(
    input: SyncPlaylistsInput,
  ): Promise<
    Result<{ playlists: SyncedPlaylist[]; removed: number }, PlaylistDeviceNotFoundError>
  > {
    const deviceId = await this.devices.findIdByMac(input.mac);
    if (!deviceId) {
      return err(new PlaylistDeviceNotFoundError('Device not found', { mac: input.mac.value }));
    }

    const owned = new Set((await this.playlists.listByDevice(deviceId)).map((p) => p.id));
    const synced: SyncedPlaylist[] = [];
    for (const item of input.playlists) {
      synced.push(await this.syncOne(deviceId, item, owned, input.addedBy));
    }

    let removed = 0;
    for (const playlistId of new Set(input.removeIds)) {
      if (!owned.has(playlistId)) continue;
      if ((await this.remove.execute({ deviceId, playlistId })).ok) removed += 1;
    }
    return ok({ playlists: synced, removed });
  }

  private async syncOne(
    deviceId: string,
    item: SyncItem,
    owned: ReadonlySet<string>,
    addedBy: AddedBy,
  ): Promise<SyncedPlaylist> {
    const line = (id: string | null, error: string | null): SyncedPlaylist => ({
      originId: item.originId,
      id,
      name: item.name,
      url: item.url,
      error,
    });
    const source = { kind: 'link' as const, url: item.url };

    if (item.originId && owned.has(item.originId)) {
      const edited = await this.edit.execute({
        deviceId,
        playlistId: item.originId,
        name: item.name,
        source,
      });
      return edited.ok ? line(edited.value.id, null) : line(null, edited.error.code);
    }

    const added = await this.add.execute({ deviceId, name: item.name, source, addedBy });
    if (added.ok) return line(added.value.id, null);
    if (added.error.code === 'playlists.exists') {
      const existing = await this.findSame(deviceId, item.url);
      if (existing) return line(existing.id, null);
    }
    return line(null, added.error.code);
  }

  /** The device's playlist that this link would duplicate. */
  private async findSame(deviceId: string, url: string): Promise<Playlist | null> {
    const content = playlistContent({ kind: 'link', url });
    if (!content.ok) return null;
    const wanted = content.value;
    const all = await this.playlists.listByDevice(deviceId);
    return (
      all.find((p) =>
        wanted.xtream
          ? p.xtream?.server === wanted.xtream.server &&
            p.xtream.username === wanted.xtream.username
          : p.type === 'm3u' && p.url === wanted.url,
      ) ?? null
    );
  }
}
