import { Injectable } from '@nestjs/common';
import { Clock } from '../../../shared/kernel/clock.js';
import type { Playlist } from '../domain/playlist.js';
import { PlaylistRepository } from './ports/playlist.repository.js';

const DAY = 24 * 60 * 60_000;

/**
 * Example playlists for local development (`pnpm cli seed:examples`), one of each type, on the
 * example devices of the devices module. Running it again refreshes the same rows.
 */
@Injectable()
export class SeedPlaylistExamples {
  constructor(
    private readonly playlists: PlaylistRepository,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<{ playlists: number }> {
    const examples = playlistExamples(this.clock.now());
    for (const playlist of examples) {
      if (await this.playlists.findById(playlist.id)) await this.playlists.update(playlist);
      else await this.playlists.insert(playlist);
    }
    return { playlists: examples.length };
  }
}

function playlistExamples(now: Date): Playlist[] {
  const playlist = (
    p: Partial<Playlist> & Pick<Playlist, 'id' | 'deviceId' | 'name' | 'type'>,
  ): Playlist => ({
    url: null,
    xtream: null,
    stalker: null,
    code: null,
    epgUrl: null,
    backup: { enabled: false, hosts: [] },
    protected: false,
    pinEnc: null,
    provider: null,
    addedBy: { via: 'app', resellerId: null },
    legacy: null,
    createdAt: new Date(now.getTime() - DAY),
    updatedAt: now,
    ...p,
  });
  return [
    // The two playlists of the running trial (its playlistCount is 2).
    playlist({
      id: 'example-playlist-m3u',
      deviceId: 'example-trial-new',
      name: 'Example M3U',
      type: 'm3u',
      url: 'http://iptv.example.com/lists/example.m3u',
      epgUrl: 'http://iptv.example.com/epg.xml',
    }),
    playlist({
      id: 'example-playlist-xtream',
      deviceId: 'example-trial-new',
      name: 'Example Xtream',
      type: 'xtream',
      url: 'http://xtream.example.com:8080/get.php?username=demo&password=demo123&type=m3u_plus&output=ts',
      xtream: { server: 'http://xtream.example.com:8080', username: 'demo', password: 'demo123' },
      // cr Android apps switch to these when the main host is down.
      backup: { enabled: true, hosts: ['backup1.example.com:8080', 'backup2.example.com:8080'] },
      provider: {
        name: 'Example IPTV',
        logo: 'https://iptv.example.com/logo.png',
        whatsapp: '+10000000000',
        email: 'support@example.com',
      },
      addedBy: { via: 'website', resellerId: null },
    }),
    // A Stalker portal and a provider code on the yearly paid device, added by its reseller.
    playlist({
      id: 'example-playlist-stalker',
      deviceId: 'example-paid-yearly',
      name: 'Example Stalker portal',
      type: 'stalker',
      stalker: {
        portalName: 'Example portal',
        portalUrl: 'http://portal.example.com/stalker_portal/c/',
        fallbackUrl: 'http://portal2.example.com/stalker_portal/c/',
        mac: '00:1a:79:00:00:01',
      },
      addedBy: { via: 'store', resellerId: 'example-reseller-1' },
    }),
    playlist({
      id: 'example-playlist-code',
      deviceId: 'example-paid-yearly',
      name: 'Example provider code',
      type: 'code',
      code: { code: '123456789', expiresAt: new Date(now.getTime() + 30 * DAY), status: 'active' },
    }),
    playlist({
      id: 'example-playlist-lifetime',
      deviceId: 'example-paid-lifetime',
      name: 'Example lifetime list',
      type: 'm3u',
      url: 'http://iptv.example.com/lists/lifetime.m3u',
      addedBy: { via: 'admin', resellerId: null },
    }),
  ];
}
