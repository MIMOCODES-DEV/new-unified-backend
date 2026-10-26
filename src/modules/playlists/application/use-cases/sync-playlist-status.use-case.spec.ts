import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePinCipher,
  FakePlaylistDevices,
  InMemoryPlaylistRepository,
} from '../../../../../test/support/playlist-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { Playlist } from '../../domain/playlist.js';
import type { PlaylistSource } from '../../domain/playlist-content.js';
import { PlaylistPins } from '../playlist-pins.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';
import {
  type SyncPlaylistStatusInput,
  SyncPlaylistStatusUseCase,
} from './sync-playlist-status.use-case.js';

const now = new Date('2026-10-26T10:00:00Z');
const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};
const TV = mac('00:1a:2b:3c:4d:5e');
const XTREAM = 'http://line.example:8080/get.php?username=u1&password=p1';

describe('SyncPlaylistStatusUseCase (PL-7)', () => {
  let playlists: InMemoryPlaylistRepository;
  let devices: FakePlaylistDevices;
  let add: AddPlaylistUseCase;
  let sync: SyncPlaylistStatusUseCase;

  beforeEach(() => {
    playlists = new InMemoryPlaylistRepository();
    devices = new FakePlaylistDevices();
    devices.byMac.set(TV.value, 'device-1');
    devices.byMac.set('00:1a:2b:3c:4d:5f', 'device-2');
    const clock = new FixedClock(now);
    add = new AddPlaylistUseCase(playlists, devices, new PlaylistPins(new FakePinCipher()), clock);
    sync = new SyncPlaylistStatusUseCase(playlists, devices, clock);
  });

  const addOne = async (
    source: PlaylistSource = { kind: 'code', code: '482915' },
    deviceId = 'device-1',
  ): Promise<Playlist> => {
    const result = await add.execute({
      deviceId,
      name: 'List',
      source,
      addedBy: { via: 'app', resellerId: null },
    });
    if (!result.ok) throw result.error;
    return result.value;
  };

  it('a new playlist has no account status yet', async () => {
    expect((await addOne()).account).toBeNull();
  });

  it('stores the status and expiry of a code playlist, keeping the code', async () => {
    const playlist = await addOne();

    const result = await sync.execute({
      mac: TV,
      playlistId: playlist.id,
      status: ' Active ',
      expiresAt: '1798761600',
    });

    expect(result.ok && result.value).toEqual({
      status: 'Active',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      checkedAt: now,
    });
    expect(playlists.items.get(playlist.id)).toMatchObject({
      code: { code: '482915' },
      account: { status: 'Active', expiresAt: new Date('2027-01-01T00:00:00Z') },
    });
  });

  it('stores it for an Xtream playlist too (the app sends it for every playlist)', async () => {
    const playlist = await addOne({ kind: 'link', url: XTREAM });

    await sync.execute({
      mac: TV,
      playlistId: playlist.id,
      status: 'Active',
      expiresAt: 1798761600,
    });

    expect(playlists.items.get(playlist.id)?.account).toEqual({
      status: 'Active',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
      checkedAt: now,
    });
  });

  it.each([
    [1798761600000, '2027-01-01T00:00:00.000Z'],
    ['2027-01-01T00:00:00Z', '2027-01-01T00:00:00.000Z'],
    ['2027-01-01', '2027-01-01T00:00:00.000Z'],
  ])('reads the expiry %j', async (value, iso) => {
    const playlist = await addOne();

    await sync.execute({ mac: TV, playlistId: playlist.id, expiresAt: value });

    expect(playlists.items.get(playlist.id)?.account?.expiresAt?.toISOString()).toBe(iso);
  });

  it('keeps the part not sent: a status alone keeps the expiry', async () => {
    const playlist = await addOne();
    await sync.execute({
      mac: TV,
      playlistId: playlist.id,
      status: 'Active',
      expiresAt: '1798761600',
    });

    await sync.execute({ mac: TV, playlistId: playlist.id, status: 'Expired' });

    expect(playlists.items.get(playlist.id)?.account).toMatchObject({
      status: 'Expired',
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    });
  });

  it('changes nothing else, whatever else is sent', async () => {
    const playlist = await addOne({ kind: 'link', url: XTREAM });
    const raw = {
      mac: TV,
      playlistId: playlist.id,
      status: 'Active',
      // What the old route copied straight into the playlist:
      deviceId: 'device-2',
      name: 'Hijacked',
      url: 'http://evil.example/list.m3u',
      xtream: { server: 'http://evil.example/', username: 'x', password: 'y' },
      protected: true,
      backup: { enabled: true, hosts: ['evil.example'] },
      auth: '1',
      fetched_at: '2026-10-26',
    } as unknown as SyncPlaylistStatusInput;

    await sync.execute(raw);

    const { account, updatedAt, ...rest } = playlists.items.get(playlist.id)!;
    const { account: before, updatedAt: beforeAt, ...restBefore } = playlist;
    expect(rest).toEqual(restBefore);
    expect(account?.status).toBe('Active');
    expect([before, beforeAt]).toEqual([null, now]);
    expect(updatedAt).toEqual(now);
  });

  it('does not touch another device’s playlist', async () => {
    const theirs = await addOne({ kind: 'code', code: '111' }, 'device-2');

    const result = await sync.execute({ mac: TV, playlistId: theirs.id, status: 'Banned' });

    expect(!result.ok && result.error.code).toBe('playlists.not_found');
    expect(playlists.items.get(theirs.id)?.account).toBeNull();
  });

  it('refuses an unknown MAC, the demo id and an unreadable date', async () => {
    const playlist = await addOne();

    const unknown = await sync.execute({ mac: mac('00:00:00:00:00:99'), playlistId: playlist.id });
    const demo = await sync.execute({ mac: TV, playlistId: 'demo', status: 'Active' });
    const badDate = await sync.execute({ mac: TV, playlistId: playlist.id, expiresAt: 'soon' });

    expect(!unknown.ok && unknown.error.code).toBe('playlists.device_not_found');
    expect(!demo.ok && demo.error.code).toBe('playlists.not_found');
    expect(!badDate.ok && badDate.error.details?.field).toBe('expiresAt');
  });

  it('clears the expiry when the provider says it never ends', async () => {
    const playlist = await addOne();
    await sync.execute({ mac: TV, playlistId: playlist.id, expiresAt: '1798761600' });

    await sync.execute({ mac: TV, playlistId: playlist.id, expiresAt: null });

    expect(playlists.items.get(playlist.id)?.account?.expiresAt).toBeNull();
  });
});
