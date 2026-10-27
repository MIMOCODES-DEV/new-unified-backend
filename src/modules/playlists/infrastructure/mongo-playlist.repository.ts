import { Injectable } from '@nestjs/common';
import type { Collection } from 'mongodb';
import { TenantDb } from '../../../shared/tenancy/tenant-db.js';
import { PlaylistRepository } from '../application/ports/playlist.repository.js';
import type { Playlist } from '../domain/playlist.js';
import {
  PLAYLISTS_COLLECTION,
  toPlaylist,
  toPlaylistDocument,
  type PlaylistDocument,
} from './playlist.document.js';

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

  async findByLegacyId(legacyId: string): Promise<Playlist | null> {
    const doc = await (await this.collection()).findOne({ 'legacy.id': legacyId });
    return doc ? toPlaylist(doc) : null;
  }

  async insert(playlist: Playlist): Promise<void> {
    await (await this.collection()).insertOne(toPlaylistDocument(playlist));
  }

  async update(playlist: Playlist): Promise<boolean> {
    const doc = toPlaylistDocument(playlist);
    return (await (await this.collection()).replaceOne({ _id: doc._id }, doc)).matchedCount > 0;
  }

  async delete(id: string): Promise<boolean> {
    return (await (await this.collection()).deleteOne({ _id: id })).deletedCount > 0;
  }

  async deleteByDevice(deviceId: string): Promise<number> {
    return (await (await this.collection()).deleteMany({ deviceId })).deletedCount;
  }
}
