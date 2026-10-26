import {
  type DynamicModule,
  type FactoryProvider,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';
import { Clock, SystemClock } from '../../shared/kernel/clock.js';
import { PlaylistPins } from './application/playlist-pins.js';
import { PinCipher } from './application/ports/pin-cipher.js';
import { PlaylistDevices } from './application/ports/playlist-devices.js';
import { PlaylistPinKey } from './application/ports/playlist-pin-key.js';
import { PlaylistRepository } from './application/ports/playlist.repository.js';
import { SeedPlaylistExamples } from './application/seed-playlist-examples.js';
import { AddPlaylistUseCase } from './application/use-cases/add-playlist.use-case.js';
import { DeletePlaylistUseCase } from './application/use-cases/delete-playlist.use-case.js';
import { EditPlaylistUseCase } from './application/use-cases/edit-playlist.use-case.js';
import { ListPlaylistsUseCase } from './application/use-cases/list-playlists.use-case.js';
import { OpenPlaylistUseCase } from './application/use-cases/open-playlist.use-case.js';
import { SetPlaylistPinUseCase } from './application/use-cases/set-playlist-pin.use-case.js';
import { SyncPlaylistsUseCase } from './application/use-cases/sync-playlists.use-case.js';
import { AesPinCipher } from './infrastructure/aes-pin.cipher.js';
import { MongoPlaylistRepository } from './infrastructure/mongo-playlist.repository.js';

const useCases = [
  AddPlaylistUseCase,
  EditPlaylistUseCase,
  DeletePlaylistUseCase,
  ListPlaylistsUseCase,
  SyncPlaylistsUseCase,
  SetPlaylistPinUseCase,
  OpenPlaylistUseCase,
];

export interface PlaylistsModuleOptions {
  /** Modules the devices factory needs. */
  imports: NonNullable<ModuleMetadata['imports']>;
  /** How playlists reach the devices module (bound by the process root: src/module-settings.ts). */
  devices: Omit<FactoryProvider<PlaylistDevices>, 'provide'>;
  /** The brand's key for playlist PINs (the brand secret `playlists.pinKey`). */
  pinKey: Omit<FactoryProvider<PlaylistPinKey>, 'provide'>;
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
        { provide: PinCipher, useClass: AesPinCipher },
        PlaylistPins,
      ],
      exports: [...useCases, SeedPlaylistExamples],
    };
  }
}
