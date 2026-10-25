import { Module } from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { PlaylistRepository } from './application/ports/playlist.repository.js';
import { SeedPlaylistExamples } from './application/seed-playlist-examples.js';
import { MongoPlaylistRepository } from './infrastructure/mongo-playlist.repository.js';

/**
 * Playlists of each brand. Its use cases (add, edit, delete, sync, reply shaping) come with the
 * Playlists feature. Needs DatabaseModule and TenancyModule (both global).
 */
@Module({
  providers: [
    SeedPlaylistExamples,
    { provide: Clock, useClass: SystemClock },
    { provide: PlaylistRepository, useClass: MongoPlaylistRepository },
  ],
  exports: [SeedPlaylistExamples],
})
export class PlaylistsModule {}
