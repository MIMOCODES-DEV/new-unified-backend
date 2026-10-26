import { Injectable } from '@nestjs/common';
import { type Collection, MongoServerError } from 'mongodb';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { PlaylistRepository } from '../application/ports/playlist.repository.js';
import type { Playlist } from '../domain/playlist.js';
import {
  PLAYLISTS_COLLECTION,
  toPlaylist,
  toPlaylistDocument,
  type PlaylistDocument,
} from './playlist.document.js';
import { PLAYLIST_NAME_INDEX } from './playlists.migrations.js';

/** playlists in the current brand's database. The collection is looked up on every call. */
@Injectable()
export class MongoPlaylistRepository extends PlaylistRepository {
  constructor(private readonly tenantDb: TenantDb) {
    super();
  }

  private collection(): Promise<Collection<PlaylistDocument>> {
    return this.tenantDb.collection<PlaylistDocument>(PLAYLISTS_COLLECTION);
  }

  async findById(id: string): Promise<Playlist | null> {
    const doc = await (await this.collection()).findOne({ _id: id });
    return doc ? toPlaylist(doc) : null;
  }

  async listByDevice(deviceId: string): Promise<Playlist[]> {
    const docs = await (
      await this.collection()
    )
      .find({ deviceId })
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map(toPlaylist);
  }

  async listOnHost(host: string, deviceIds: readonly string[] | null): Promise<Playlist[]> {
    // The host is text, escaped and anchored right after the scheme (and any login), never a
    // pattern the caller controls.
    const escaped = host.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const onHost = new RegExp(`^https?://(?:[^/@]*@)?${escaped}(?::\\d+)?(?:[/?#]|$)`, 'i');
    const docs = await (
      await this.collection()
    )
      .find({
        ...(deviceIds ? { deviceId: { $in: [...deviceIds] } } : {}),
        $or: [
          { url: onHost },
          { 'xtream.server': onHost },
          { 'stalker.portalUrl': onHost },
          { 'stalker.fallbackUrl': onHost },
        ],
      })
      .sort({ createdAt: 1 })
      .toArray();
    return docs.map(toPlaylist);
  }

  async findByLegacyId(legacyId: string): Promise<Playlist | null> {
    const doc = await (await this.collection()).findOne({ 'legacy.id': legacyId });
    return doc ? toPlaylist(doc) : null;
  }

  async insert(playlist: Playlist): Promise<'inserted' | 'duplicate' | 'name_taken'> {
    try {
      await (await this.collection()).insertOne(toPlaylistDocument(playlist));
      return 'inserted';
    } catch (error) {
      const clash = duplicateOf(error);
      if (clash) return clash;
      throw error;
    }
  }

  async update(playlist: Playlist): Promise<'updated' | 'missing' | 'duplicate' | 'name_taken'> {
    const doc = toPlaylistDocument(playlist);
    try {
      const result = await (await this.collection()).replaceOne({ _id: doc._id }, doc);
      return result.matchedCount > 0 ? 'updated' : 'missing';
    } catch (error) {
      const clash = duplicateOf(error);
      if (clash) return clash;
      throw error;
    }
  }

  async delete(id: string): Promise<boolean> {
    return (await (await this.collection()).deleteOne({ _id: id })).deletedCount > 0;
  }

  async deleteByDevice(deviceId: string): Promise<number> {
    return (await (await this.collection()).deleteMany({ deviceId })).deletedCount;
  }
}

/**
 * Which unique index refused the write: `name_once_per_device` (the name is taken) or one of the
 * `<type>_once_per_device` indexes (the same playlist again). Null for any other error.
 */
function duplicateOf(error: unknown): 'name_taken' | 'duplicate' | null {
  if (!(error instanceof MongoServerError) || error.code !== 11000) return null;
  return error.message.includes(PLAYLIST_NAME_INDEX) ? 'name_taken' : 'duplicate';
}
