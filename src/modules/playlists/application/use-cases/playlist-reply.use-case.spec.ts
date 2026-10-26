import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePinCipher,
  InMemoryPlaylistRepository,
} from '../../../../../test/support/playlist-fakes.js';
import type { Playlist } from '../../domain/playlist.js';
import { playlistContent, type PlaylistSource } from '../../domain/playlist-content.js';
import { PlaylistPins } from '../playlist-pins.js';
import { PlaylistBrand } from '../ports/playlist-brand.js';
import { PlaylistReplyUseCase, type PlaylistReplyInput } from './playlist-reply.use-case.js';

const XTREAM = 'http://line.example:8080/get.php?username=u1&password=p1&type=m3u_plus&output=ts';
const M3U = 'https://cdn.example/list.m3u';
const DEMO = 'http://demo.example/get.php?username=demo&password=demo';

class Brand extends PlaylistBrand {
  profile: 'xc' | 'general' = 'xc';
  raw44 = false;
  demo: string | null = DEMO;
  replyProfile() {
    return Promise.resolve(this.profile);
  }
  rawForAndroid44() {
    return Promise.resolve(this.raw44);
  }
  demoUrl() {
    return Promise.resolve(this.demo);
  }
}

let n = 0;
function stored(source: PlaylistSource, overrides: Partial<Playlist> = {}): Playlist {
  const content = playlistContent(source);
  if (!content.ok) throw content.error;
  n += 1;
  return {
    id: `pl-${n}`,
    deviceId: 'device-1',
    name: `List ${n}`,
    ...content.value,
    epgUrl: null,
    backup: { enabled: false, hosts: [] },
    protected: false,
    pinEnc: null,
    provider: null,
    addedBy: { via: 'app', resellerId: null },
    legacy: null,
    createdAt: new Date(2026, 9, 26, 10, n),
    updatedAt: new Date(2026, 9, 26, 10, n),
    ...overrides,
  };
}

describe('PlaylistReplyUseCase (PL-4)', () => {
  let playlists: InMemoryPlaylistRepository;
  let brand: Brand;
  let reply: PlaylistReplyUseCase;

  const ask = (overrides: Partial<PlaylistReplyInput> = {}) =>
    reply.execute({
      deviceId: 'device-1',
      platform: 'samsung',
      appVersion: '1.2.0',
      stalkerEnabled: true,
      includePins: false,
      ...overrides,
    });

  beforeEach(() => {
    playlists = new InMemoryPlaylistRepository();
    brand = new Brand();
    reply = new PlaylistReplyUseCase(playlists, brand, new PlaylistPins(new FakePinCipher()));
  });

  describe('links by brand profile', () => {
    it('xc: an Xtream playlist goes as server, username and password', async () => {
      await playlists.insert(stored({ kind: 'link', url: XTREAM }));

      const [item] = (await ask()).playlists;

      expect(item).toMatchObject({
        type: 'xc',
        url: 'http://line.example:8080/',
        username: 'u1',
        password: 'p1',
        originUrl: XTREAM,
      });
    });

    it('general: an Xtream playlist goes as one get.php link', async () => {
      brand.profile = 'general';
      await playlists.insert(
        stored({
          kind: 'xtream',
          server: 'http://line.example:8080',
          username: 'u1',
          password: 'p1',
        }),
      );

      const [item] = (await ask()).playlists;

      expect(item).toMatchObject({
        type: 'general',
        url: 'http://line.example:8080/get.php?username=u1&password=p1&type=m3u_plus&output=ts',
        username: null,
      });
    });

    it('an M3U playlist is a general link in every profile', async () => {
      await playlists.insert(stored({ kind: 'link', url: M3U }));

      expect((await ask()).playlists[0]).toMatchObject({ type: 'general', url: M3U });
    });

    it('Stalker and code playlists keep their own parts', async () => {
      await playlists.insert(
        stored({
          kind: 'stalker',
          portalUrl: 'http://portal.example/c/',
          mac: '00:1a:79:00:00:01',
        }),
      );
      await playlists.insert(stored({ kind: 'code', code: '482915' }));

      const [stalker, code] = (await ask()).playlists;

      expect(stalker).toMatchObject({
        type: 'stalker',
        url: null,
        stalker: { portalUrl: 'http://portal.example/c/' },
      });
      expect(code).toMatchObject({ type: 'code', code: '482915', url: null });
    });

    it('Android 44* builds get links as typed when the brand turns it on', async () => {
      brand.raw44 = true;
      await playlists.insert(stored({ kind: 'link', url: XTREAM }));

      const android44 = await ask({ platform: 'android', appVersion: '44.1' });
      const android45 = await ask({ platform: 'android', appVersion: '45.0' });

      expect(android44.playlists[0]).toMatchObject({ type: 'general', url: XTREAM });
      expect(android45.playlists[0]).toMatchObject({ type: 'xc' });
    });

    it('Android 44* builds follow the profile when the brand flag is off', async () => {
      await playlists.insert(stored({ kind: 'link', url: XTREAM }));

      expect((await ask({ platform: 'android', appVersion: '44.1' })).playlists[0]?.type).toBe(
        'xc',
      );
    });
  });

  describe('demo playlist', () => {
    it('a device with no playlist gets the demo playlist', async () => {
      const result = await ask();

      expect(result.hasOwnPlaylist).toBe(false);
      expect(result.playlists).toEqual([
        expect.objectContaining({ id: null, demo: true, type: 'xc', username: 'demo' }),
      ]);
    });

    it('a device with its own playlist gets no demo', async () => {
      await playlists.insert(stored({ kind: 'link', url: M3U }));

      const result = await ask();

      expect(result.hasOwnPlaylist).toBe(true);
      expect(result.playlists.some((p) => p.demo)).toBe(false);
    });

    it('only Stalker portals with Stalker off: the demo comes too', async () => {
      await playlists.insert(stored({ kind: 'stalker', portalUrl: 'http://portal.example/c/' }));

      const off = await ask({ stalkerEnabled: false });
      const on = await ask({ stalkerEnabled: true });

      expect(off.playlists.map((p) => p.type)).toEqual(['stalker', 'xc']);
      expect(on.playlists.some((p) => p.demo)).toBe(false);
    });

    it('no demo when the brand has none', async () => {
      brand.demo = null;

      expect((await ask()).playlists).toEqual([]);
    });
  });

  describe('PIN and provider', () => {
    it('never sends the PIN unless asked; Roku and iOS ask for it', async () => {
      const pins = new PlaylistPins(new FakePinCipher());
      await playlists.insert(
        stored({ kind: 'link', url: M3U }, { protected: true, pinEnc: await pins.encrypt('4321') }),
      );

      const app = (await ask()).playlists[0];
      const roku = (await ask({ includePins: true })).playlists[0];

      expect(app).toMatchObject({ protected: true });
      expect(app).not.toHaveProperty('pin');
      expect(roku).toMatchObject({ protected: true, pin: '4321' });
    });

    it('returns the provider branding with the playlist', async () => {
      const provider = {
        name: 'Line TV',
        logo: 'https://line.example/logo.png',
        whatsapp: '+100',
        email: null,
      };
      await playlists.insert(stored({ kind: 'link', url: M3U }, { provider }));

      expect((await ask()).playlists[0]?.provider).toEqual(provider);
    });
  });
});
