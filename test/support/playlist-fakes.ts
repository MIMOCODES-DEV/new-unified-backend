import { PinCipher } from '../../src/modules/playlists/application/ports/pin-cipher.js';
import { PlaylistDevices } from '../../src/modules/playlists/application/ports/playlist-devices.js';
import type { PlaylistRepository } from '../../src/modules/playlists/application/ports/playlist.repository.js';
import type { Playlist } from '../../src/modules/playlists/domain/playlist.js';
import type { MacAddress } from '../../src/shared/kernel/mac-address.js';

const tick = () => new Promise<void>((resolve) => setImmediate(resolve));

/** The `<type>_once_per_device` unique indexes: what makes two playlists of a device the same. */
function sameKey(p: Playlist): string {
  switch (p.type) {
    case 'm3u':
      return `m3u|${p.deviceId}|${p.url}`;
    case 'xtream':
      return `xtream|${p.deviceId}|${p.xtream?.server}|${p.xtream?.username}`;
    case 'stalker':
      return `stalker|${p.deviceId}|${p.stalker?.portalUrl}|${p.stalker?.mac}`;
    case 'code':
      return `code|${p.deviceId}|${p.code?.code}`;
  }
}

export class InMemoryPlaylistRepository implements PlaylistRepository {
  readonly items = new Map<string, Playlist>();

  private clashes(playlist: Playlist): boolean {
    const key = sameKey(playlist);
    return [...this.items.values()].some((p) => p.id !== playlist.id && sameKey(p) === key);
  }

  async findById(id: string): Promise<Playlist | null> {
    await tick();
    return this.items.get(id) ?? null;
  }
  async listByDevice(deviceId: string): Promise<Playlist[]> {
    await tick();
    return [...this.items.values()]
      .filter((p) => p.deviceId === deviceId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  }
  async findByLegacyId(legacyId: string): Promise<Playlist | null> {
    await tick();
    return [...this.items.values()].find((p) => p.legacy?.id === legacyId) ?? null;
  }
  async insert(playlist: Playlist): Promise<'inserted' | 'duplicate'> {
    await tick();
    if (this.clashes(playlist)) return 'duplicate';
    this.items.set(playlist.id, playlist);
    return 'inserted';
  }
  async update(playlist: Playlist): Promise<'updated' | 'missing' | 'duplicate'> {
    await tick();
    if (!this.items.has(playlist.id)) return 'missing';
    if (this.clashes(playlist)) return 'duplicate';
    this.items.set(playlist.id, playlist);
    return 'updated';
  }
  async delete(id: string): Promise<boolean> {
    await tick();
    return this.items.delete(id);
  }
  async deleteByDevice(deviceId: string): Promise<number> {
    await tick();
    const ids = [...this.items.values()].filter((p) => p.deviceId === deviceId).map((p) => p.id);
    ids.forEach((id) => this.items.delete(id));
    return ids.length;
  }
}

/** Devices by MAC, and the playlist count changes reported for each device. */
export class FakePlaylistDevices extends PlaylistDevices {
  readonly byMac = new Map<string, string>();
  readonly counts = new Map<string, number>();

  findIdByMac(mac: MacAddress): Promise<string | null> {
    return Promise.resolve(this.byMac.get(mac.value) ?? null);
  }
  playlistCountChanged(deviceId: string, delta: number): Promise<void> {
    this.counts.set(deviceId, (this.counts.get(deviceId) ?? 0) + delta);
    return Promise.resolve();
  }
}

/** Reversible stand-in for the brand-key cipher: enough to tell PINs apart in tests. */
export class FakePinCipher extends PinCipher {
  encrypt(pin: string): Promise<string> {
    return Promise.resolve(`enc(${[...pin].reverse().join('')})`);
  }
  decrypt(pinEnc: string): Promise<string> {
    return Promise.resolve([...pinEnc.slice(4, -1)].reverse().join(''));
  }
}
