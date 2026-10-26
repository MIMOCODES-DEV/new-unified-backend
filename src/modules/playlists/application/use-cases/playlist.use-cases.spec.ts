import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakePinCipher,
  FakePlaylistDevices,
  InMemoryPlaylistRepository,
} from '../../../../../test/support/playlist-fakes.js';
import { FixedClock } from '../../../../shared/kernel/clock.js';
import { MacAddress } from '../../../../shared/kernel/mac-address.js';
import type { AddedBy } from '../../domain/playlist.js';
import { PlaylistPins } from '../playlist-pins.js';
import { AddPlaylistUseCase } from './add-playlist.use-case.js';
import { DeletePlaylistUseCase } from './delete-playlist.use-case.js';
import { EditPlaylistUseCase } from './edit-playlist.use-case.js';
import { ListPlaylistsUseCase } from './list-playlists.use-case.js';
import { DashboardPlaylistsUseCase } from './dashboard-playlists.use-case.js';
import { UnlockPlaylistUseCase } from './unlock-playlist.use-case.js';
import { SetPlaylistBackupUseCase } from './set-playlist-backup.use-case.js';
import { SetPlaylistPinUseCase } from './set-playlist-pin.use-case.js';
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
  let setPin: SetPlaylistPinUseCase;
  let setBackup: SetPlaylistBackupUseCase;
  let open: UnlockPlaylistUseCase;
  let dashboard: DashboardPlaylistsUseCase;

  beforeEach(() => {
    playlists = new InMemoryPlaylistRepository();
    devices = new FakePlaylistDevices();
    devices.byMac.set('00:1a:2b:3c:4d:5e', 'device-1');
    devices.byMac.set('00:1a:2b:3c:4d:5f', 'device-2');
    const clock = new FixedClock(now);
    const pins = new PlaylistPins(new FakePinCipher());
    add = new AddPlaylistUseCase(playlists, devices, pins, clock);
    edit = new EditPlaylistUseCase(playlists, pins, clock);
    remove = new DeletePlaylistUseCase(playlists, devices, pins);
    setPin = new SetPlaylistPinUseCase(playlists, pins, clock);
    setBackup = new SetPlaylistBackupUseCase(playlists, pins, clock);
    open = new UnlockPlaylistUseCase(playlists, pins);
    dashboard = new DashboardPlaylistsUseCase(playlists);
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
        by: 'app',
        playlistId: playlist.id,
        name: 'New',
      });

      expect(renamed.ok && renamed.value).toMatchObject({ name: 'New', url: M3U, type: 'm3u' });
    });

    it('re-reads the link when it changes, so an m3u can become xtream', async () => {
      const playlist = await addLink('device-1', M3U);

      const changed = await edit.execute({
        deviceId: 'device-1',
        by: 'app',
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
        by: 'app',
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
        by: 'app',
        playlistId: second.id,
        source: { kind: 'link', url: M3U },
      });

      expect(!result.ok && result.error.code).toBe('playlists.exists');
    });
  });

  describe('delete', () => {
    it('deletes the device’s playlist and counts it down', async () => {
      const playlist = await addLink('device-1', M3U);

      const result = await remove.execute({
        deviceId: 'device-1',
        by: 'app',
        playlistId: playlist.id,
      });

      expect(result.ok).toBe(true);
      expect(playlists.items.size).toBe(0);
      expect(devices.counts.get('device-1')).toBe(0);
    });

    it('does not delete another device’s playlist', async () => {
      const playlist = await addLink('device-2', M3U);

      const result = await remove.execute({
        deviceId: 'device-1',
        by: 'app',
        playlistId: playlist.id,
      });

      expect(!result.ok && result.error.code).toBe('playlists.not_found');
      expect(playlists.items.size).toBe(1);
    });

    it('counts a playlist down once when two deletes race', async () => {
      const playlist = await addLink('device-1', M3U);

      await Promise.all([
        remove.execute({ deviceId: 'device-1', by: 'app', playlistId: playlist.id }),
        remove.execute({ deviceId: 'device-1', by: 'app', playlistId: playlist.id }),
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

  describe('PIN protection (PL-3)', () => {
    const protect = async (pin = '1234') => {
      const playlist = await addLink('device-1', M3U);
      const result = await setPin.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        pin,
      });
      if (!result.ok) throw result.error;
      return playlist.id;
    };

    it('protects a playlist and stores the PIN encrypted, never in clear', async () => {
      const id = await protect('1234');

      expect(playlists.items.get(id)).toMatchObject({ protected: true });
      expect(playlists.items.get(id)?.pinEnc).not.toContain('1234');
    });

    it('opens a protected playlist only with its PIN', async () => {
      const id = await protect('1234');

      const none = await open.execute({ deviceId: 'device-1', playlistId: id });
      const wrong = await open.execute({ deviceId: 'device-1', playlistId: id, pin: '9999' });
      const right = await open.execute({ deviceId: 'device-1', playlistId: id, pin: '1234' });

      expect(!none.ok && none.error.code).toBe('playlists.pin_required');
      expect(!wrong.ok && wrong.error.code).toBe('playlists.wrong_pin');
      expect(right.ok && right.value.id).toBe(id);
    });

    it('opens an unprotected playlist without a PIN', async () => {
      const playlist = await addLink('device-1', M3U);

      expect((await open.execute({ deviceId: 'device-1', playlistId: playlist.id })).ok).toBe(true);
    });

    it('refuses to edit or delete a protected playlist without its PIN', async () => {
      const id = await protect('1234');

      const editNone = await edit.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: id,
        name: 'X',
      });
      const deleteWrong = await remove.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: id,
        pin: '0000',
      });
      const editRight = await edit.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: id,
        name: 'X',
        pin: '1234',
      });

      expect(!editNone.ok && editNone.error.code).toBe('playlists.pin_required');
      expect(!deleteWrong.ok && deleteWrong.error.code).toBe('playlists.wrong_pin');
      expect(editRight.ok && editRight.value.name).toBe('X');
      expect(playlists.items.has(id)).toBe(true);
    });

    it('changes the PIN only with the current one', async () => {
      const id = await protect('1234');

      const without = await setPin.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: id,
        pin: '5555',
      });
      const withIt = await setPin.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: id,
        pin: '5555',
        currentPin: '1234',
      });

      expect(!without.ok && without.error.code).toBe('playlists.pin_required');
      expect(withIt.ok).toBe(true);
      expect((await open.execute({ deviceId: 'device-1', playlistId: id, pin: '5555' })).ok).toBe(
        true,
      );
    });

    it('removes the protection with the current PIN', async () => {
      const id = await protect('1234');

      const result = await setPin.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: id,
        pin: null,
        currentPin: '1234',
      });

      expect(result.ok && result.value.protected).toBe(false);
      expect(playlists.items.get(id)).toMatchObject({ protected: false, pinEnc: null });
    });

    it.each(['123', '12345', 'abcd'])('refuses the PIN "%s"', async (pin) => {
      const playlist = await addLink('device-1', M3U);

      const result = await setPin.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        pin,
      });

      expect(!result.ok && result.error.code).toBe('playlists.invalid_pin');
    });

    it('does not let a device protect another device’s playlist', async () => {
      const playlist = await addLink('device-2', M3U);

      const result = await setPin.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        pin: '1234',
      });

      expect(!result.ok && result.error.code).toBe('playlists.not_found');
    });

    it('the app changes and removes a protected playlist without the PIN', async () => {
      const id = await protect('1234');
      const other = await addLink('device-1', 'https://cdn.example/second.m3u');
      await setPin.execute({ deviceId: 'device-1', by: 'app', playlistId: other.id, pin: '5678' });

      const renamed = await edit.execute({
        deviceId: 'device-1',
        by: 'app',
        playlistId: id,
        name: 'App name',
      });
      const result = await sync.execute({
        mac: mac('00:1a:2b:3c:4d:5e'),
        playlists: [{ originId: id, name: 'Synced', url: M3U }],
        removeIds: [other.id],
        addedBy: app,
      });

      expect(renamed.ok).toBe(true);
      expect(result.ok && result.value.playlists[0]?.error).toBeNull();
      expect(playlists.items.get(id)?.name).toBe('Synced');
      expect(result.ok && result.value).toMatchObject({ removed: 1, notRemoved: [] });
      expect(playlists.items.has(other.id)).toBe(false);
    });

    it('the dashboard list hides a protected playlist’s data until it is unlocked', async () => {
      const id = await protect('1234');
      const open2 = await addLink('device-1', 'https://cdn.example/open.m3u', 'Open');

      const listed = await dashboard.execute('device-1');

      expect(listed).toContainEqual({
        id,
        name: 'List',
        type: 'm3u',
        protected: true,
        hidden: true,
      });
      expect(listed.find((p) => p.id === open2.id)).toMatchObject({
        url: 'https://cdn.example/open.m3u',
      });
      expect(JSON.stringify(listed.find((p) => p.id === id))).not.toContain('cdn.example');
    });

    it('adds a playlist protected in one step, as the website add form does', async () => {
      const result = await add.execute({
        deviceId: 'device-1',
        name: 'Kids',
        source: { kind: 'link', url: M3U },
        pin: '4321',
        addedBy: { via: 'website', resellerId: null },
      });

      expect(result.ok && result.value.protected).toBe(true);
      if (!result.ok) return;
      expect(result.value.pinEnc).not.toContain('4321');
      expect((await open.execute({ deviceId: 'device-1', playlistId: result.value.id })).ok).toBe(
        false,
      );
      expect(
        (await open.execute({ deviceId: 'device-1', playlistId: result.value.id, pin: '4321' })).ok,
      ).toBe(true);
    });

    it('refuses to add with a bad PIN and saves nothing', async () => {
      const result = await add.execute({
        deviceId: 'device-1',
        name: 'Kids',
        source: { kind: 'link', url: M3U },
        pin: '12',
        addedBy: app,
      });

      expect(!result.ok && result.error.code).toBe('playlists.invalid_pin');
      expect(playlists.items.size).toBe(0);
    });

    it('sets, changes and removes the PIN from the edit form in one step', async () => {
      const playlist = await addLink('device-1', M3U);

      const set = await edit.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        name: 'Kids',
        newPin: '1111',
      });
      const changeWithout = await edit.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        newPin: '2222',
      });
      const change = await edit.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        pin: '1111',
        newPin: '2222',
      });
      const removeIt = await edit.execute({
        deviceId: 'device-1',
        by: 'dashboard',
        playlistId: playlist.id,
        pin: '2222',
        newPin: null,
      });

      expect(set.ok && set.value).toMatchObject({ name: 'Kids', protected: true });
      expect(!changeWithout.ok && changeWithout.error.code).toBe('playlists.pin_required');
      expect(change.ok && change.value.protected).toBe(true);
      expect(removeIt.ok && removeIt.value).toMatchObject({ protected: false, pinEnc: null });
    });
  });

  describe('backup hosts (PL-5)', () => {
    it('stores up to 8 hosts and turns them on', async () => {
      const playlist = await addLink('device-1', M3U);

      const result = await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'app',
        enabled: true,
        hosts: ['Mirror1.example.com', 'mirror2.example.com:8080'],
      });

      expect(result.ok && result.value).toEqual({
        enabled: true,
        hosts: ['mirror1.example.com', 'mirror2.example.com:8080'],
      });
    });

    it('turning backups off keeps the hosts', async () => {
      const playlist = await addLink('device-1', M3U);
      await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'app',
        enabled: true,
        hosts: ['m.example.com'],
      });

      await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'app',
        enabled: false,
      });

      expect(playlists.items.get(playlist.id)?.backup).toEqual({
        enabled: false,
        hosts: ['m.example.com'],
      });
    });

    it('refuses a bad host and changes nothing', async () => {
      const playlist = await addLink('device-1', M3U);

      const result = await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'app',
        enabled: true,
        hosts: ['nope'],
      });

      expect(!result.ok && result.error.code).toBe('playlists.invalid_playlist');
      expect(playlists.items.get(playlist.id)?.backup).toEqual({ enabled: false, hosts: [] });
    });

    it('the dashboard needs the PIN of a protected playlist', async () => {
      const playlist = await addLink('device-1', M3U);
      await setPin.execute({
        deviceId: 'device-1',
        by: 'app',
        playlistId: playlist.id,
        pin: '1234',
      });

      const without = await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'dashboard',
        enabled: true,
        hosts: ['m.example.com'],
      });
      const withPin = await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'dashboard',
        pin: '1234',
        enabled: true,
        hosts: ['m.example.com'],
      });

      expect(!without.ok && without.error.code).toBe('playlists.pin_required');
      expect(withPin.ok).toBe(true);
    });

    it('does not touch another device’s playlist', async () => {
      const playlist = await addLink('device-2', M3U);

      const result = await setBackup.execute({
        deviceId: 'device-1',
        playlistId: playlist.id,
        by: 'app',
        enabled: true,
        hosts: ['m.example.com'],
      });

      expect(!result.ok && result.error.code).toBe('playlists.not_found');
    });
  });
});
