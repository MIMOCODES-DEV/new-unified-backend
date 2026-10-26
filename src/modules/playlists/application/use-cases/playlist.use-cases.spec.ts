import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePlaylistDevices,
  InMemoryPlaylistRepository,
} from '../../../../../test/support/playlist-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { AddedBy } from '../../domain/playlist.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';
import { DeletePlaylistUseCase } from './delete-playlist.use-case.js';
import { EditPlaylistUseCase } from './edit-playlist.use-case.js';
import { ListPlaylistsUseCase } from './list-playlists.use-case.js';
import { SyncPlaylistsUseCase } from './sync-playlists.use-case.js';

const now = new Date('2026-10-26T10:00:00Z');
const app: AddedBy = { via: 'app', resellerId: null };
const XTREAM = 'http://line.example:8080/get.php?username=u1&password=p1&type=m3u_plus';
const M3U = 'https://cdn.example/list.m3u';

const mac = (value: string) => {
  const parsed = MacAddress.parse(value);
  if (!parsed.ok) throw parsed.error;
  return parsed.value;
};

describe('Playlists: add, edit, delete, list, sync (PL-2)', () => {
  let playlists: InMemoryPlaylistRepository;
  let devices: FakePlaylistDevices;
  let add: AddPlaylistUseCase;
  let edit: EditPlaylistUseCase;
  let remove: DeletePlaylistUseCase;
  let list: ListPlaylistsUseCase;
  let sync: SyncPlaylistsUseCase;

  beforeEach(() => {
    playlists = new InMemoryPlaylistRepository();
    devices = new FakePlaylistDevices();
    devices.byMac.set('00:1a:2b:3c:4d:5e', 'device-1');
    devices.byMac.set('00:1a:2b:3c:4d:5f', 'device-2');
    const clock = new FixedClock(now);
    add = new AddPlaylistUseCase(playlists, devices, clock);
    edit = new EditPlaylistUseCase(playlists, clock);
    remove = new DeletePlaylistUseCase(playlists, devices);
    list = new ListPlaylistsUseCase(playlists);
    sync = new SyncPlaylistsUseCase(playlists, devices, add, edit, remove);
  });

  const addLink = async (deviceId: string, url: string, name = 'List') => {
    const result = await add.execute({
      deviceId,
      name,
      source: { kind: 'link', url },
      addedBy: app,
    });
    if (!result.ok) throw result.error;
    return result.value;
  };

  describe('add', () => {
    it('adds a playlist, records who added it and counts it on the device', async () => {
      const result = await add.execute({
        deviceId: 'device-1',
        name: ' Sports ',
        source: { kind: 'link', url: XTREAM },
        epgUrl: 'http://epg.example/xml',
        addedBy: { via: 'website', resellerId: null },
      });

      expect(result.ok && result.value).toMatchObject({
        deviceId: 'device-1',
        name: 'Sports',
        type: 'xtream',
        url: XTREAM,
        epgUrl: 'http://epg.example/xml',
        addedBy: { via: 'website', resellerId: null },
        backup: { enabled: false, hosts: [] },
        protected: false,
        createdAt: now,
      });
      expect(devices.counts.get('device-1')).toBe(1);
    });

    it('refuses the same playlist twice on one device, and does not count it', async () => {
      await addLink('device-1', XTREAM);

      const again = await add.execute({
        deviceId: 'device-1',
        name: 'Copy',
        source: {
          kind: 'xtream',
          server: 'http://line.example:8080',
          username: 'u1',
          password: 'other',
        },
        addedBy: app,
      });

      expect(!again.ok && again.error.code).toBe('playlists.exists');
      expect(devices.counts.get('device-1')).toBe(1);
    });

    it('allows the same playlist on another device, and has no limit per device', async () => {
      await addLink('device-1', M3U);
      await addLink('device-2', M3U);
      for (let i = 0; i < 30; i++) await addLink('device-1', `${M3U}?n=${i}`);

      expect(await list.execute('device-1')).toHaveLength(31);
      expect(await list.execute('device-2')).toHaveLength(1);
    });

    it('refuses a bad name or link and saves nothing', async () => {
      const badName = await add.execute({
        deviceId: 'device-1',
        name: ' ',
        source: { kind: 'link', url: M3U },
        addedBy: app,
      });
      const badLink = await add.execute({
        deviceId: 'device-1',
        name: 'x',
        source: { kind: 'link', url: 'nope' },
        addedBy: app,
      });

      expect(!badName.ok && badName.error.details?.field).toBe('name');
      expect(!badLink.ok && badLink.error.details?.field).toBe('url');
      expect(playlists.items.size).toBe(0);
      expect(devices.counts.size).toBe(0);
    });
  });

  describe('edit', () => {
    it('changes only what is sent', async () => {
      const playlist = await addLink('device-1', M3U, 'Old');

      const renamed = await edit.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        name: 'New',
      });

      expect(renamed.ok && renamed.value).toMatchObject({ name: 'New', url: M3U, type: 'm3u' });
    });

    it('re-reads the link when it changes, so an m3u can become xtream', async () => {
      const playlist = await addLink('device-1', M3U);

      const changed = await edit.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        source: { kind: 'link', url: XTREAM },
      });

      expect(changed.ok && changed.value).toMatchObject({
        type: 'xtream',
        url: XTREAM,
        xtream: { server: 'http://line.example:8080/', username: 'u1', password: 'p1' },
      });
    });

    it('does not let a device change another device’s playlist', async () => {
      const playlist = await addLink('device-2', M3U);

      const result = await edit.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        name: 'Mine',
      });

      expect(!result.ok && result.error.code).toBe('playlists.not_found');
      expect(playlists.items.get(playlist.id)?.name).toBe('List');
    });

    it('refuses an edit that copies another playlist of the device', async () => {
      await addLink('device-1', M3U);
      const second = await addLink('device-1', 'https://cdn.example/other.m3u');

      const result = await edit.execute({
        deviceId: 'device-1',
        playlistId: second.id,
        source: { kind: 'link', url: M3U },
      });

      expect(!result.ok && result.error.code).toBe('playlists.exists');
    });
  });

  describe('delete', () => {
    it('deletes the device’s playlist and counts it down', async () => {
      const playlist = await addLink('device-1', M3U);

      const result = await remove.execute({ deviceId: 'device-1', playlistId: playlist.id });

      expect(result.ok).toBe(true);
      expect(playlists.items.size).toBe(0);
      expect(devices.counts.get('device-1')).toBe(0);
    });

    it('does not delete another device’s playlist', async () => {
      const playlist = await addLink('device-2', M3U);

      const result = await remove.execute({ deviceId: 'device-1', playlistId: playlist.id });

      expect(!result.ok && result.error.code).toBe('playlists.not_found');
      expect(playlists.items.size).toBe(1);
    });

    it('counts a playlist down once when two deletes race', async () => {
      const playlist = await addLink('device-1', M3U);

      await Promise.all([
        remove.execute({ deviceId: 'device-1', playlistId: playlist.id }),
        remove.execute({ deviceId: 'device-1', playlistId: playlist.id }),
      ]);

      expect(devices.counts.get('device-1')).toBe(0);
    });
  });

  describe('bulk sync by MAC (update_playlist)', () => {
    it('adds new items and returns their new ids next to the app ids', async () => {
      const result = await sync.execute({
        mac: mac('00:1a:2b:3c:4d:5e'),
        playlists: [
          { originId: 'non_saved_1', name: 'A', url: M3U },
          { originId: 'non_saved_2', name: 'B', url: XTREAM },
        ],
        removeIds: [],
        addedBy: app,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.playlists.map((p) => p.originId)).toEqual(['non_saved_1', 'non_saved_2']);
      expect(result.value.playlists.every((p) => p.id && !p.error)).toBe(true);
      expect(await list.execute('device-1')).toHaveLength(2);
      expect(devices.counts.get('device-1')).toBe(2);
    });

    it('changes items the device already has and removes remove_ids', async () => {
      const keep = await addLink('device-1', M3U, 'Keep');
      const drop = await addLink('device-1', 'https://cdn.example/drop.m3u');

      const result = await sync.execute({
        mac: mac('00:1a:2b:3c:4d:5e'),
        playlists: [{ originId: keep.id, name: 'Renamed', url: M3U }],
        removeIds: [drop.id, 'non_saved_9'],
        addedBy: app,
      });

      expect(result.ok && result.value.removed).toBe(1);
      expect((await list.execute('device-1')).map((p) => p.name)).toEqual(['Renamed']);
    });

    it('only touches the calling device: another device’s ids are added as new or ignored', async () => {
      const other = await addLink('device-2', M3U, 'Theirs');

      const result = await sync.execute({
        mac: mac('00:1a:2b:3c:4d:5e'),
        playlists: [{ originId: other.id, name: 'Hijack', url: 'https://evil.example/x.m3u' }],
        removeIds: [other.id],
        addedBy: app,
      });

      expect(result.ok && result.value.removed).toBe(0);
      expect(playlists.items.get(other.id)).toMatchObject({ name: 'Theirs', deviceId: 'device-2' });
      expect(await list.execute('device-1')).toHaveLength(1);
    });

    it('changes nothing when the same list is sent again', async () => {
      const send = () =>
        sync.execute({
          mac: mac('00:1a:2b:3c:4d:5e'),
          playlists: [{ originId: 'non_saved_1', name: 'A', url: XTREAM }],
          removeIds: [],
          addedBy: app,
        });

      const first = await send();
      const second = await send();

      expect(first.ok && second.ok).toBe(true);
      if (!first.ok || !second.ok) return;
      expect(second.value.playlists[0]?.id).toBe(first.value.playlists[0]?.id);
      expect(await list.execute('device-1')).toHaveLength(1);
    });

    it('reports a bad item and still saves the others', async () => {
      const result = await sync.execute({
        mac: mac('00:1a:2b:3c:4d:5e'),
        playlists: [
          { originId: 'a', name: 'Bad', url: 'not a link' },
          { originId: 'b', name: 'Good', url: M3U },
        ],
        removeIds: [],
        addedBy: app,
      });

      expect(result.ok && result.value.playlists.map((p) => p.error)).toEqual([
        'playlists.invalid_playlist',
        null,
      ]);
    });

    it('refuses an unknown MAC', async () => {
      const result = await sync.execute({
        mac: mac('00:00:00:00:00:99'),
        playlists: [{ originId: 'a', name: 'A', url: M3U }],
        removeIds: [],
        addedBy: app,
      });

      expect(!result.ok && result.error.code).toBe('playlists.device_not_found');
      expect(playlists.items.size).toBe(0);
    });
  });
});
