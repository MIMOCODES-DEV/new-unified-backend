import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePinCipher,
  FakePlaylistDevices,
  InMemoryPlaylistRepository,
} from '../../../../../test/support/playlist-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import { PlaylistPins } from '../playlist-pins.js';
import { MacOnlyRateLimit } from '../ports/mac-only-rate-limit.js';
import { AddPlaylistByMacUseCase } from './add-playlist-by-mac.use-case.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';
import { DeletePlaylistsByMacUseCase } from './delete-playlists-by-mac.use-case.js';

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};
const TV = mac('00:1a:2b:3c:4d:5e');

/** Allows `limit` calls per IP, like the Redis limiter within one window. */
class CountingLimit extends MacOnlyRateLimit {
  readonly calls = new Map<string, number>();
  constructor(private readonly limit = 3) {
    super();
  }
  take(ip: string) {
    const count = (this.calls.get(ip) ?? 0) + 1;
    this.calls.set(ip, count);
    return Promise.resolve({
      allowed: count <= this.limit,
      retryAfterMs: count <= this.limit ? 0 : 60_000,
    });
  }
}

describe('Playlists by MAC without a login (PL-6)', () => {
  let playlists: InMemoryPlaylistRepository;
  let devices: FakePlaylistDevices;
  let limit: CountingLimit;
  let add: AddPlaylistUseCase;
  let addByMac: AddPlaylistByMacUseCase;
  let deleteByMac: DeletePlaylistsByMacUseCase;

  beforeEach(() => {
    playlists = new InMemoryPlaylistRepository();
    devices = new FakePlaylistDevices();
    devices.byMac.set(TV.value, 'device-1');
    limit = new CountingLimit();
    add = new AddPlaylistUseCase(
      playlists,
      devices,
      new PlaylistPins(new FakePinCipher()),
      new FixedClock(new Date('2026-10-26T10:00:00Z')),
    );
    addByMac = new AddPlaylistByMacUseCase(devices, limit, add);
    deleteByMac = new DeletePlaylistsByMacUseCase(playlists, devices, limit);
  });

  const addFor = (ip = '198.51.100.1', url = 'https://cdn.example/list.m3u') =>
    addByMac.execute({ mac: TV, ip, name: 'From QR', source: { kind: 'link', url } });

  describe('add (QR code, Stalker form, add by MAC)', () => {
    it('adds to the device with this MAC, recorded as added on the website', async () => {
      const result = await addFor();

      expect(result.ok && result.value).toMatchObject({
        deviceId: 'device-1',
        name: 'From QR',
        addedBy: { via: 'website', resellerId: null },
      });
      expect(devices.counts.get('device-1')).toBe(1);
    });

    it('adds a Stalker portal from the Stalker form', async () => {
      const result = await addByMac.execute({
        mac: TV,
        ip: '198.51.100.1',
        name: 'Portal',
        source: {
          kind: 'stalker',
          portalUrl: 'http://portal.example/c/',
          mac: '00:1A:79:00:00:01',
        },
      });

      expect(result.ok && result.value.type).toBe('stalker');
    });

    it('refuses an unknown MAC', async () => {
      const result = await addByMac.execute({
        mac: mac('00:00:00:00:00:99'),
        ip: '198.51.100.1',
        name: 'x',
        source: { kind: 'link', url: 'https://cdn.example/list.m3u' },
      });

      expect(!result.ok && result.error.code).toBe('playlists.device_not_found');
    });

    it('limits each IP, counting every call whatever its outcome', async () => {
      await addFor('198.51.100.1', 'https://cdn.example/1.m3u');
      await addByMac.execute({
        mac: mac('00:00:00:00:00:99'),
        ip: '198.51.100.1',
        name: 'x',
        source: { kind: 'link', url: 'https://cdn.example/x.m3u' },
      });
      await addFor('198.51.100.1', 'https://cdn.example/2.m3u');

      const fourth = await addFor('198.51.100.1', 'https://cdn.example/3.m3u');
      const otherIp = await addFor('203.0.113.9', 'https://cdn.example/4.m3u');

      expect(!fourth.ok && fourth.error).toMatchObject({
        code: 'playlists.too_many_requests',
        details: { retryAfterMs: 60_000 },
      });
      expect(otherIp.ok).toBe(true);
    });
  });

  describe('delete by MAC', () => {
    it('deletes the device’s playlists, keeps protected ones, and counts them down', async () => {
      await addFor('198.51.100.1', 'https://cdn.example/1.m3u');
      await add.execute({
        deviceId: 'device-1',
        name: 'Kids',
        source: { kind: 'link', url: 'https://cdn.example/kids.m3u' },
        pin: '1234',
        addedBy: { via: 'app', resellerId: null },
      });

      const result = await deleteByMac.execute({ mac: TV, ip: '203.0.113.9' });

      expect(result.ok && result.value).toEqual({ deleted: 1, keptProtected: 1 });
      expect([...playlists.items.values()].map((p) => p.name)).toEqual(['Kids']);
      expect(devices.counts.get('device-1')).toBe(1);
    });

    it('refuses an unknown MAC and is rate limited too', async () => {
      const unknown = await deleteByMac.execute({
        mac: mac('00:00:00:00:00:99'),
        ip: '203.0.113.9',
      });
      await deleteByMac.execute({ mac: TV, ip: '203.0.113.9' });
      await deleteByMac.execute({ mac: TV, ip: '203.0.113.9' });
      const limited = await deleteByMac.execute({ mac: TV, ip: '203.0.113.9' });

      expect(!unknown.ok && unknown.error.code).toBe('playlists.device_not_found');
      expect(!limited.ok && limited.error.code).toBe('playlists.too_many_requests');
    });
  });
});
