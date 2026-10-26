import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { PlaylistPins } from './application/playlist-pins.js';
import { PinCipher } from './application/ports/pin-cipher.js';
import { PlaylistBrand } from './application/ports/playlist-brand.js';
import { PlaylistDevices } from './application/ports/playlist-devices.js';
import { PlaylistPinKey } from './application/ports/playlist-pin-key.js';
import { PlaylistRepository } from './application/ports/playlist.repository.js';
import { SeedPlaylistExamples } from './application/seed-playlist-examples.js';
import { AddPlaylistUseCase } from './application/use-cases/add-playlist.use-case.js';
import { DeletePlaylistUseCase } from './application/use-cases/delete-playlist.use-case.js';
import { EditPlaylistUseCase } from './application/use-cases/edit-playlist.use-case.js';
import { ListPlaylistsUseCase } from './application/use-cases/list-playlists.use-case.js';
import { DashboardPlaylistsUseCase } from './application/use-cases/dashboard-playlists.use-case.js';
import { PlaylistReplyUseCase } from './application/use-cases/playlist-reply.use-case.js';
import { SetPlaylistPinUseCase } from './application/use-cases/set-playlist-pin.use-case.js';
import { SetPlaylistBackupUseCase } from './application/use-cases/set-playlist-backup.use-case.js';
import { SyncPlaylistsUseCase } from './application/use-cases/sync-playlists.use-case.js';
import { UnlockPlaylistUseCase } from './application/use-cases/unlock-playlist.use-case.js';
import { AesPinCipher } from './infrastructure/aes-pin.cipher.js';
import { MongoPlaylistRepository } from './infrastructure/mongo-playlist.repository.js';

const useCases = [
  AddPlaylistUseCase,
  EditPlaylistUseCase,
  DeletePlaylistUseCase,
  ListPlaylistsUseCase,
  SyncPlaylistsUseCase,
  SetPlaylistPinUseCase,
  UnlockPlaylistUseCase,
  DashboardPlaylistsUseCase,
  PlaylistReplyUseCase,
  SetPlaylistBackupUseCase,
];

export interface PlaylistsModuleOptions {
  /** Modules the devices factory needs. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** How playlists reach the devices module (bound by the process root: src/module-settings.ts). */
  devices: Omit<FactoryProvider<PlaylistDevices>, 'provide'>;
  /** The brand's key for playlist PINs (the brand secret `playlists.pinKey`). */
  pinKey: Omit<FactoryProvider<PlaylistPinKey>, 'provide'>;
  /** Brand settings the reply reads (profile, Android 4.4 flag, demo link). */
  brand: Omit<FactoryProvider<PlaylistBrand>, 'provide'>;
}

/** Playlists of each brand. Needs DatabaseModule and TenancyModule (both global). */
@Module({})
export class PlaylistsModule {
  static forRootAsync(options: PlaylistsModuleOptions): DynamicModule {
    return {
      module: PlaylistsModule,
      imports: options.imports,
      providers: [
        ...useCases,
        SeedPlaylistExamples,
        { provide: Clock, useClass: SystemClock },
        { provide: PlaylistRepository, useClass: MongoPlaylistRepository },
        { provide: PlaylistDevices, ...options.devices },
        { provide: PlaylistPinKey, ...options.pinKey },
        { provide: PlaylistBrand, ...options.brand },
        { provide: PinCipher, useClass: AesPinCipher },
        PlaylistPins,
      ],
      exports: [...useCases, SeedPlaylistExamples],
    };
  }
}
