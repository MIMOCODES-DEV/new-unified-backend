import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePinCipher,
  FakePlaylistDevices,
  InMemoryPlaylistRepository,
} from '../../../../../test/support/playlist-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { PlaylistSource } from '../../domain/playlist-content.js';
import { PlaylistPins } from '../playlist-pins.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';
import {
  type MoveProviderHostInput,
  MoveProviderHostUseCase,
} from './move-provider-host.use-case.js';

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('MoveProviderHostUseCase (PL-8)', () => {
  let playlists: InMemoryPlaylistRepository;
  let devices: FakePlaylistDevices;
  let add: AddPlaylistUseCase;
  let move: MoveProviderHostUseCase;

  beforeEach(() => {
    playlists = new InMemoryPlaylistRepository();
    devices = new FakePlaylistDevices();
    devices.byMac.set('00:1a:2b:3c:4d:5e', 'device-1');
    devices.byMac.set('00:1a:2b:3c:4d:5f', 'device-2');
    const clock = new FixedClock(new Date('2026-10-26T10:00:00Z'));
    add = new AddPlaylistUseCase(playlists, devices, new PlaylistPins(new FakePinCipher()), clock);
    move = new MoveProviderHostUseCase(playlists, devices, clock);
  });

  const addOne = async (source: PlaylistSource, deviceId = 'device-1') => {
    const result = await add.execute({
      deviceId,
      name: 'List',
      source,
      addedBy: { via: 'app', resellerId: null },
    });
    if (!result.ok) throw result.error;
    return result.value;
  };
  const run = async (overrides: Partial<MoveProviderHostInput> = {}) => {
    const result = await move.execute({
      from: 'old.example.com',
      to: 'new.example.com',
      scope: { kind: 'brand' },
      countOnly: false,
      ...overrides,
    });
    if (!result.ok) throw result.error;
    return result.value;
  };

  it('moves the host of every kind of link; path, login and port stay', async () => {
    const xtream = await addOne({
      kind: 'link',
      url: 'http://old.example.com:8080/get.php?username=u&password=p',
    });
    const m3u = await addOne({ kind: 'link', url: 'https://OLD.example.com/lists/a.m3u' });
    const stalker = await addOne({
      kind: 'stalker',
      portalUrl: 'http://old.example.com/c/',
      fallbackUrl: 'http://backup.example.com/c/',
    });

    const report = await run();

    expect(report).toEqual({ matched: 3, changed: 3, skipped: 0 });
    expect(playlists.items.get(xtream.id)).toMatchObject({
      url: 'http://new.example.com:8080/get.php?username=u&password=p',
      xtream: { server: 'http://new.example.com:8080/', username: 'u', password: 'p' },
    });
    expect(playlists.items.get(m3u.id)?.url).toBe('https://new.example.com/lists/a.m3u');
    expect(playlists.items.get(stalker.id)?.stalker).toMatchObject({
      portalUrl: 'http://new.example.com/c/',
      fallbackUrl: 'http://backup.example.com/c/',
    });
  });

  it('matches the host exactly, never part of another host, a path or a password', async () => {
    const lookalikes = await Promise.all([
      addOne({ kind: 'link', url: 'http://sub.old.example.com/a.m3u' }),
      addOne({ kind: 'link', url: 'http://old.example.com.evil.net/a.m3u' }),
      addOne({ kind: 'link', url: 'http://other.example.com/old.example.com/a.m3u' }),
      addOne({
        kind: 'link',
        url: 'http://other.example.com/get.php?username=old.example.com&password=p',
      }),
    ]);

    const report = await run();

    expect(report.matched).toBe(0);
    for (const p of lookalikes) expect(playlists.items.get(p.id)?.url).toBe(p.url);
  });

  it('treats the host as text: regex characters match nothing else', async () => {
    await addOne({ kind: 'link', url: 'http://oldxexample.com/a.m3u' });

    const result = await move.execute({
      from: 'old.example.com',
      to: 'new.example.com',
      scope: { kind: 'brand' },
      countOnly: true,
    });
    const pattern = await move.execute({
      from: 'old.*',
      to: 'new.example.com',
      scope: { kind: 'brand' },
      countOnly: true,
    });

    expect(result.ok && result.value.matched).toBe(0);
    expect(!pattern.ok && pattern.error.details?.field).toBe('from');
  });

  it('with a port, moves only links on that port, and can set a new port', async () => {
    const on8080 = await addOne({ kind: 'link', url: 'http://old.example.com:8080/a.m3u' });
    const on80 = await addOne({ kind: 'link', url: 'http://old.example.com/b.m3u' });

    const report = await run({ from: 'old.example.com:8080', to: 'new.example.com:2095' });

    expect(report.changed).toBe(1);
    expect(playlists.items.get(on8080.id)?.url).toBe('http://new.example.com:2095/a.m3u');
    expect(playlists.items.get(on80.id)?.url).toBe('http://old.example.com/b.m3u');
  });

  it('counts without changing anything in count-only mode', async () => {
    const p = await addOne({ kind: 'link', url: 'http://old.example.com/a.m3u' });

    const report = await run({ countOnly: true });

    expect(report).toEqual({ matched: 1, changed: 0, skipped: 0 });
    expect(playlists.items.get(p.id)?.url).toBe('http://old.example.com/a.m3u');
  });

  it('changes at most `limit`, oldest first, for a gradual move', async () => {
    for (const n of [1, 2, 3])
      await addOne({ kind: 'link', url: `http://old.example.com/${n}.m3u` });

    const first = await run({ limit: 2 });
    const second = await run();

    expect(first).toEqual({ matched: 3, changed: 2, skipped: 0 });
    expect(second).toEqual({ matched: 1, changed: 1, skipped: 0 });
  });

  it('only touches the given devices for a reseller', async () => {
    const mine = await addOne({ kind: 'link', url: 'http://old.example.com/a.m3u' }, 'device-1');
    const theirs = await addOne({ kind: 'link', url: 'http://old.example.com/a.m3u' }, 'device-2');

    const report = await run({
      scope: { kind: 'devices', macs: [mac('00:1a:2b:3c:4d:5e'), mac('00:00:00:00:00:99')] },
    });

    expect(report.changed).toBe(1);
    expect(playlists.items.get(mine.id)?.url).toBe('http://new.example.com/a.m3u');
    expect(playlists.items.get(theirs.id)?.url).toBe('http://old.example.com/a.m3u');
  });

  it('skips a playlist the device already has on the new host', async () => {
    await addOne({ kind: 'link', url: 'http://new.example.com/a.m3u' });
    const old = await addOne({ kind: 'link', url: 'http://old.example.com/a.m3u' });

    const report = await run();

    expect(report).toEqual({ matched: 1, changed: 0, skipped: 1 });
    expect(playlists.items.get(old.id)?.url).toBe('http://old.example.com/a.m3u');
  });

  it.each([
    ['http://old.example.com', 'from'],
    ['old.example.com/path', 'from'],
    ['localhost', 'from'],
  ])('refuses the host %j', async (from, field) => {
    const result = await move.execute({
      from,
      to: 'new.example.com',
      scope: { kind: 'brand' },
      countOnly: true,
    });

    expect(!result.ok && result.error.details?.field).toBe(field);
  });

  it('refuses moving a host onto itself', async () => {
    const result = await move.execute({
      from: 'old.example.com',
      to: 'OLD.example.com',
      scope: { kind: 'brand' },
      countOnly: true,
    });

    expect(!result.ok && result.error.details?.field).toBe('to');
  });
});
